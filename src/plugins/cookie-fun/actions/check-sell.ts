import {
  elizaLogger,
  type Action,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  type ActionExample,
} from "@elizaos/core";

import { DexscreenerProvider } from "../providers/dexscreener-provider.ts";
import { PROFIT_TARGET, STOP_LOSS } from "../config.ts";

import { TokenMetricsProvider } from "../providers/token-metrics-provider-psql.ts";

export const checkSell: Action = {
  name: "CHECK_SELL",
  similes: ["CHECK", "CHECK SELL", "CHECK PROFITS", "CHECK TRADES"],
  description: "Checks if any active trades should be sold",

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
      //-------------------------------Stellschrauben--------------------------------
      const alwaysFlagsForSell = false; // Flags all active trades for sell
      const printDexScreenerResponse = false; // Prints the DexScreener response (duh)
      //-------------------------------Stellschrauben--------------------------------

      const dexscreenerProvider = new DexscreenerProvider();

      const tokenMetricsProvider = new TokenMetricsProvider(
        runtime.getSetting("DB_CONNECTION_STRING")
      );

      const activeTrades = await tokenMetricsProvider.getActiveTrades();
      elizaLogger.log(
        `📊 Checking ${activeTrades.length} active trades for sellconditions`
      );

      let markedForSelling = 0;
      let totalPnL = 0;
      for (const trade of activeTrades) {
        try {
          const dexData = await dexscreenerProvider.fetchTokenPrice(
            trade.token_address
          );
          if (printDexScreenerResponse) {
            elizaLogger.log("DexScreener response:", dexData);
          }

          // Find the WETH pair
          const wethPair = dexData.pairs?.find(
            (p) => p.quoteToken.symbol === "WETH"
          );
          const currentPriceInEth = wethPair?.priceNative
            ? parseFloat(wethPair.priceNative)
            : null;
          const entryPrice = trade.entry_price;
          const symbol = wethPair?.baseToken?.symbol || trade.symbol; // Use trade.symbol as fallback

          elizaLogger.log(`Debug values for ${symbol}:`, {
            currentPriceInEth,
            entryPrice,
            hasCurrentPrice: !!currentPriceInEth,
            hasEntryPrice: !!entryPrice,
            pairFound: !!wethPair,
          });

          if (!entryPrice || !currentPriceInEth) {
            elizaLogger.log(`Skipping ${symbol} due to missing price data`);
            continue;
          }

          const profitLossPercent =
            ((currentPriceInEth - entryPrice) / entryPrice) * 100;

          if (
            profitLossPercent >= PROFIT_TARGET ||
            profitLossPercent <= STOP_LOSS ||
            alwaysFlagsForSell
          ) {
            elizaLogger.log(
              `�� Sell signal for ${symbol}: P/L = ${profitLossPercent}%`
            );
            markedForSelling++;

            const updatedMetrics = {
              ...trade,
              sellSignal: true,
              timestamp: new Date().toISOString(),
            };
            tokenMetricsProvider.upsertTokenMetrics(updatedMetrics);
          }

          totalPnL += profitLossPercent;
        } catch (error) {
          elizaLogger.error(`Error checking sell for ${trade.symbol}:`, error);
        }
      }

      elizaLogger.log(
        `✅ Sell check completed. Flagged ${markedForSelling} of ${activeTrades.length} trades for selling`
      );

      if (callback) {
        callback({
          text: `💰 Trade check complete | ${
            activeTrades.length
          } active trades monitored | ${markedForSelling} sell signals | Average P/L: ${
            totalPnL / activeTrades.length || 0
          }%`,
          action: "CHECK_SELL_COMPLETE",
        });
      }

      return true;
    } catch (error) {
      elizaLogger.error("❌ Error in sell check:", error);
      if (callback) {
        callback({
          text: `Failed to check trades: ${error.message}`,
          action: "CHECK_ERROR",
        });
      }
      return false;
    }
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Check if we should sell any tokens",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Checking sell conditions for active trades...",
          action: "CHECK_SELL",
        },
      },
    ],
    [
      {
        user: "{{user2}}",
        content: {
          text: "How are our trades performing?",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "I'll check the profit/loss status of our trades.",
          action: "CHECK_SELL",
        },
      },
    ],
    [
      {
        user: "{{user3}}",
        content: {
          text: "Should we take profits?",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Analyzing trades for profit-taking opportunities...",
          action: "CHECK_SELL",
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
