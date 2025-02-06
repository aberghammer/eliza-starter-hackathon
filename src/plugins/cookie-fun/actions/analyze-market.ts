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
    "Fetches market data from Cookie API and DexScreener, computes trading metrics including short-term momentum (price and social) based on the last historical entry, and updates the database.",

  validate: async (_runtime: IAgentRuntime, _message: Memory) => {
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<boolean> => {
    try {
      elizaLogger.log("📊 Starting market data analysis...");

      // Stellschraube: Falls gewünscht, können alle aktiven Trading-Daten gelöscht werden.
      const cleanDatabase = false;

      // Provider initialisieren
      const dbConn = runtime.getSetting("DB_CONNECTION_STRING");
      const tokenMetricsProvider = new TokenMetricsProvider(dbConn);
      const cookieApiProvider = new CookieApiProvider(runtime);
      const dexscreenerProvider = new DexscreenerProvider();

      if (cleanDatabase) {
        await tokenMetricsProvider.cleanupAllTokenMetrics();
        elizaLogger.log("🧹 Active trading table cleaned.");
      }

      // Hole Agent-Daten von der Cookie API (z. B. paginiert)
      const agentsResponse = await cookieApiProvider.fetchAgentsPaged(
        "_7Days",
        1,
        10
      );
      if (!agentsResponse || !agentsResponse.ok || !agentsResponse.ok.data) {
        throw new Error("No agent data returned from Cookie API.");
      }
      const agents = agentsResponse.ok.data;
      elizaLogger.log(`Fetched ${agents.length} agents for analysis.`);

      // Iteriere über alle abgerufenen Agenten
      for (const agent of agents) {
        // Verwende den ersten Vertrag als repräsentativen Token
        const contract = agent.contracts[0];
        if (!contract) {
          elizaLogger.log(`No contract data for agent ${agent.agentName}`);
          continue;
        }

        // Hole zusätzliche Token-Daten via DexScreener (z. B. Liquidität, 24h-Preisänderung, aktueller Preis)
        const dexData = await dexscreenerProvider.fetchTokenPrice(
          contract.contractAddress
        );

        // Aktuelle Werte (wir nehmen an, dass entweder agent oder dexData den aktuellen Preis liefern)
        const currentPrice = agent.price || dexData.price; // z. B. 0.64325315
        const currentMindshare = agent.mindshare;

        // Standardmäßig nutzen wir die API-Deltas als Fallback
        let priceMomentum = agent.priceDeltaPercent || 0;
        let socialMomentum = agent.mindshareDeltaPercent || 0;

        // Versuche, den letzten historischen Eintrag für diesen Token abzurufen,
        // um kurzfristige (z. B. 5-Minuten-) Deltas zu berechnen.
        const previousEntries =
          await tokenMetricsProvider.getLatestTokenMetricsForToken(
            contract.contractAddress
          );
        if (previousEntries && previousEntries.length > 0) {
          const lastEntry = previousEntries[0];

          // Berechne Price Momentum nur, wenn lastEntry.price ungleich 0 ist.
          if (
            lastEntry.price !== undefined &&
            lastEntry.price !== 0 &&
            currentPrice !== undefined
          ) {
            priceMomentum =
              ((currentPrice - lastEntry.price) / lastEntry.price) * 100;
          } else {
            priceMomentum = 0;
          }

          // Berechne Social/Mindshare Momentum analog.
          if (
            lastEntry.mindshare !== undefined &&
            lastEntry.mindshare !== 0 &&
            currentMindshare !== undefined
          ) {
            socialMomentum =
              ((currentMindshare - lastEntry.mindshare) / lastEntry.mindshare) *
              100;
          } else {
            socialMomentum = 0;
          }
        }

        const scaledPriceMomentum = priceMomentum / 100;
        const scaledSocialMomentum = socialMomentum / 100;
        const totalScore =
          0.4 * scaledPriceMomentum + 0.6 * scaledSocialMomentum;
        const buySignal = totalScore > 0.2; // Angepasster Schwellenwert für die skalierten Werte

        // Erstelle das TokenMetrics-Objekt (wir nehmen an, dass das Interface nun auch ein 'price'-Feld enthält)
        const tokenMetrics: TokenMetrics = {
          token_address: contract.contractAddress,
          chain_id: contract.chain,
          chain_name: contract.chain === -2 ? "Solana" : "EVM",
          symbol: agent.agentName,
          mindshare: currentMindshare,
          liquidity: dexData.liquidity || 0,
          price_change24h: dexData.price_change24h || 0,
          price_momentum: priceMomentum,
          social_momentum: socialMomentum,
          total_score: totalScore,
          timestamp: new Date().toISOString(),
          buy_signal: buySignal,
          sell_signal: false,
          entry_price: null,
          exit_price: null,
          profit_loss: null,
          finalized: false,
          price: currentPrice,
        };

        // 1. Schreibe alle Analyseergebnisse in die historisierte Tabelle
        await tokenMetricsProvider.insertHistoricalMetrics(tokenMetrics);
        // 2. Falls ein Kaufsignal vorliegt, upsert in die aktive Trading-Tabelle
        if (
          buySignal &&
          (tokenMetrics.chain_id === 42161 || tokenMetrics.chain_id === 8453)
        ) {
          await tokenMetricsProvider.upsertTokenMetrics(tokenMetrics);
          elizaLogger.log(
            `Buy signal set for ${agent.agentName} in active trading table.`
          );
        } else {
          elizaLogger.log(
            `No buy signal for ${agent.agentName}; only historical data recorded.`
          );
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
    [
      {
        user: "{{user2}}",
        content: {
          text: "Please scan the market and compute trading signals.",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Analyzing market data. Stand by...",
          action: "ANALYZE_MARKET",
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
