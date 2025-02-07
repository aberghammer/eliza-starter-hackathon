import { elizaLogger, ICacheManager, UUID } from "@elizaos/core";
import {
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  type Action,
} from "@elizaos/core";

import type { TokenMetrics } from "../types/TokenMetrics.ts";
import { CookieApiProvider } from "../providers/cookie-api-provider.ts";
import { DexscreenerProvider } from "../providers/dexscreener-provider.ts";
import { TokenMetricsProvider } from "../providers/token-metrics-provider-psql.ts";

export const analyzeMarket: Action = {
  name: "ANALYZE_MARKET",
  similes: [
    "ANALYZE MARKET",
    "SCAN MARKET",
    "CHECK MARKET DATA",
    "MARKET ANALYSIS",
  ],
  description:
    "Fetches market data from Cookie API and DexScreener, computes trading metrics using Z-Score normalization for multiple factors.",

  validate: async (_runtime: IAgentRuntime, _message: Memory) => true,

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<boolean> => {
    try {
      elizaLogger.log("📊 Starting market data analysis...");

      const dbConn = runtime.getSetting("DB_CONNECTION_STRING");
      const tokenMetricsProvider = new TokenMetricsProvider(dbConn);
      const cookieApiProvider = new CookieApiProvider(runtime);
      const dexscreenerProvider = new DexscreenerProvider();

      const agentsResponse = await cookieApiProvider.fetchAgentsPaged(
        "_7Days",
        1,
        10
      );
      if (!agentsResponse?.ok?.data) {
        throw new Error("No agent data returned from Cookie API.");
      }

      const agents = agentsResponse.ok.data;
      elizaLogger.log(`Fetched ${agents.length} agents for analysis.`);

      for (const agent of agents) {
        const contract = agent.contracts[0];
        if (!contract) {
          elizaLogger.log(`No contract data for agent ${agent.agentName}`);
          continue;
        }

        const chainMap: Record<string, string> = {
          "-2": "Solana", // ✅ Solana ist ein String-Key
          "1": "Ethereum",
          "56": "Binance Smart Chain",
          "42161": "Arbitrum",
          "10": "Optimism",
          "137": "Polygon",
          "8453": "Base",
          "43114": "Avalanche",
        };

        const chainName = chainMap[String(contract.chain)] || "Unknown";

        const dexData = await dexscreenerProvider.fetchTokenPrice(
          contract.contractAddress
        );

        // ✅ **Hier sicherstellen, dass die Werte aus dem Backend korrekt sind**
        const currentMetrics = {
          price: Number(agent.price) || Number(dexData.price),
          volume_24h: Number(agent.volume24Hours) || Number(dexData.volume),
          mindshare: Number(agent.mindshare),
          liquidity: Number(agent.liquidity) || Number(dexData.liquidit) || 0,
          holders_count: Number(agent.holdersCount),
        };

        // 📌 Holt vergangene Einträge für Z-Score-Berechnung
        const previousEntries =
          await tokenMetricsProvider.getLatestTokenMetricsForToken(
            contract.contractAddress
          );

        if (!previousEntries || previousEntries.length < 3) {
          elizaLogger.log(
            `⚠️ Not enough historical data for ${agent.agentName}. Logging metrics anyway.`
          );
        }
        const history = {
          price: previousEntries
            .map((e) => Number(e.price))
            .filter((val) => !isNaN(val)),
          volume_24h: previousEntries
            .map((e) => Number(e.volume_24h))
            .filter((val) => !isNaN(val)),
          mindshare: previousEntries
            .map((e) => Number(e.mindshare))
            .filter((val) => !isNaN(val)),
          liquidity: previousEntries
            .map((e) => Number(e.liquidity))
            .filter((val) => !isNaN(val)),
          holders_count: previousEntries
            .map((e) => Number(e.holders_count))
            .filter((val) => !isNaN(val)),
        };

        function computeZScore(value: number, series: number[]): number {
          if (series.length < 3) return 0;
          const mean =
            series.reduce((sum, val) => sum + val, 0) / series.length;
          const stdDev = Math.sqrt(
            series.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
              series.length
          );
          return stdDev === 0 ? 0 : (value - mean) / stdDev;
        }

        const scores = {
          price: computeZScore(currentMetrics.price, history.price),
          volume_24h: computeZScore(
            currentMetrics.volume_24h,
            history.volume_24h
          ),
          mindshare: computeZScore(currentMetrics.mindshare, history.mindshare),
          liquidity: computeZScore(currentMetrics.liquidity, history.liquidity),
          holders_count: computeZScore(
            currentMetrics.holders_count,
            history.holders_count
          ),
        };

        const FACTOR_WEIGHTS = {
          price: 0.4,
          volume_24h: 0.25,
          mindshare: 0.15,
          liquidity: 0.1,
          holders_count: 0.1,
        };

        const totalScore = Object.keys(scores).reduce(
          (sum, key) =>
            sum +
            scores[key as keyof typeof scores] *
              FACTOR_WEIGHTS[key as keyof typeof FACTOR_WEIGHTS],
          0
        );

        const buySignal = totalScore >= 0.5;
        const sellSignal = totalScore <= -0.5;

        const tokenMetrics: TokenMetrics = {
          token_address: contract.contractAddress,
          chain_id: contract.chain,
          chain_name: chainName,
          symbol: agent.agentName,
          mindshare: currentMetrics.mindshare,
          liquidity: currentMetrics.liquidity,
          price: currentMetrics.price,
          volume_24h: currentMetrics.volume_24h,
          holders_count: currentMetrics.holders_count,
          price_momentum: scores.price,
          volume_momentum: scores.volume_24h,
          mindshare_momentum: scores.mindshare,
          liquidity_momentum: scores.liquidity,
          holders_momentum: scores.holders_count,
          total_score: totalScore,
          timestamp: new Date().toISOString(),
          buy_signal: buySignal,
          sell_signal: sellSignal,
          entry_price: null,
          exit_price: null,
          profit_loss: null,
          finalized: false,
        };

        // 📌 **Jedes Mal wird in die History geschrieben!**
        await tokenMetricsProvider.insertHistoricalMetrics(tokenMetrics);
        elizaLogger.log(`📜 Logged ${agent.agentName} to history.`);

        if (
          buySignal &&
          (tokenMetrics.chain_id === 42161 || tokenMetrics.chain_id === 8453)
        ) {
          await tokenMetricsProvider.upsertTokenMetrics(tokenMetrics);
          elizaLogger.log(
            `📈 Buy signal for ${agent.agentName} - Inserted into active trading table.`
          );
        } else if (sellSignal) {
          elizaLogger.log(`❌ Sell signal for ${agent.agentName}.`);
        } else {
          elizaLogger.log(`⚖️ Hold signal for ${agent.agentName}.`);
        }
      }

      if (callback) {
        callback({
          text: `📊 Market analysis complete. Processed ${agents.length} agents.`,
          action: "ANALYZE_MARKET_COMPLETE",
        });
      }

      elizaLogger.log("✅ Market analysis completed successfully.");
      return true;
    } catch (error) {
      elizaLogger.error("❌ Error during market analysis:", error);
      return false;
    }
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: "Can you analyze the current market data?" },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Starting market data analysis...",
          action: "ANALYZE_MARKET",
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
