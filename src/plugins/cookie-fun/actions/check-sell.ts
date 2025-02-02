import { elizaLogger } from "@elizaos/core";
import {
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  type Action,
} from "@elizaos/core";
import BetterSQLite3 from "better-sqlite3";
import { TokenMetricsProvider } from "../providers/token-metrics-provider.ts";
import { DexscreenerProvider } from "../providers/dexscreener-provider.ts";
import { UUID } from "crypto";

export const checkSell: Action = {
  name: "CHECK_SELL",
  //similes: ["SELL TOKEN", "CHECK SELL TOKEN", "SELL NOW"],
  similes: ["check"],
  description: "Selling at particular price point.",

  validate: async (_runtime: IAgentRuntime, _message: Memory) => {
    return true;
  },

  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
    _options: { [key: string]: unknown },
    _callback: HandlerCallback
  ): Promise<boolean> => {
    try {
      elizaLogger.log("📡 Checking for gainz... or losses whatever 🐸");

      //-------------------------------Stellschrauben--------------------------------
      const alwaysSell = false; //Forces a sell simulating a profit taking, instead of waiting to hit the rules (above 30% gains or below 20% loss)
      //-------------------------------Stellschrauben--------------------------------

      const db = new BetterSQLite3("data/db.sqlite");
      const tokenMetricsProvider = new TokenMetricsProvider(db);
      const dexscreenerProvider = new DexscreenerProvider();

      const openTrades = tokenMetricsProvider.getActiveTrades();
      elizaLogger.log(`📊 ${openTrades.length} offene Trades gefunden`);

      for (const trade of openTrades) {
        const currentPriceData = await dexscreenerProvider.fetchTokenPrice(
          trade.tokenAddress
        );

        elizaLogger.log("DexScreener response:", currentPriceData);

        // Find the WETH pair (that's the one with ETH price)
        const wethPair = currentPriceData.pairs?.find(
          p => p.quoteToken.symbol === "WETH"
        );

        if (!wethPair) {
          elizaLogger.error(`⚠️ No WETH pair found for ${trade.tokenAddress}`);
          continue;
        }

        // Use the native (ETH) price directly from the WETH pair
        const currentPriceInEth = parseFloat(wethPair.priceNative);

        if (!currentPriceInEth || !trade.entryPrice) {
          elizaLogger.error(`⚠️ Missing price data for ${trade.tokenAddress} (Current: ${currentPriceInEth}, Entry: ${trade.entryPrice})`);
          continue;
        }

        const profitLossPercent = Math.round(
          ((currentPriceInEth - trade.entryPrice) / trade.entryPrice) * 100
        );

        elizaLogger.log(`📊 ${trade.symbol} current stats:`, {
          entryPrice: trade.entryPrice,
          currentPriceEth: currentPriceInEth,
          currentPriceUsd: wethPair.priceUsd,
          liquidity: wethPair.liquidity.usd,
          profitLoss: `${profitLossPercent}%`
        });

        // Before the sell checks, calculate the message once
        const profitLossText = profitLossPercent >= 0 
          ? `+$profitLossPercent% Gewinn`
          : `$profitLossPercent% Verlust`;

        // Just show current status
        elizaLogger.log(`📈 ${trade.symbol} hat aktuell ${profitLossText}`);

        if (alwaysSell || profitLossPercent >= 30) { 
          elizaLogger.log(`✅ Selling ${trade.symbol} with +${profitLossPercent.toFixed(2)}% profit!`);
          elizaLogger.log(
            `${profitLossPercent >= 0 ? '✅' : '⛔'} Selling ${trade.symbol} with ${profitLossText}!`
          );

          // Create sell memory
          const sellMemory: Memory = {
            id: `${_message.id}-sell` as UUID,
            agentId: _runtime.agentId,
            userId: _message.userId,
            roomId: _message.roomId,
            createdAt: Date.now(),
            content: {
              text: `Selling token ${trade.tokenAddress} at +${profitLossPercent}% profit`,
              action: "SELL_TOKEN",
              tokenAddress: trade.tokenAddress,
              source: "direct"
            },
          };

          // Execute the sell
          await _runtime.processActions(
            sellMemory,
            [sellMemory],
            _state,
            async (result) => {
              if (result.action === "TOKEN_SOLD") {
                elizaLogger.log(`✅ ${profitLossPercent >= 0 ? 'Profit' : 'Loss'} take completed successfully (${profitLossPercent}%)`);
              } else if (result.action === "SELL_ERROR") {
                elizaLogger.error("❌ Sale failed");
              }
              return [];
            }
          );
        } else if (alwaysSell || profitLossPercent <= -20) { 
          elizaLogger.log(`⛔ Selling ${trade.symbol} with ${profitLossPercent.toFixed(2)}% loss!`);

          // Create sell memory for stop loss
          const sellMemory: Memory = {
            id: `${_message.id}-sell` as UUID,
            agentId: _runtime.agentId,
            userId: _message.userId,
            roomId: _message.roomId,
            createdAt: Date.now(),
            content: {
              text: `Selling token ${trade.tokenAddress} at ${profitLossPercent}% loss (stop loss)`,
              action: "SELL_TOKEN",
              tokenAddress: trade.tokenAddress,
              source: "direct"
            },
          };

          // Execute the stop loss
          await _runtime.processActions(
            sellMemory,
            [sellMemory],
            _state,
            async (result) => {
              if (result.action === "TOKEN_SOLD") {
                elizaLogger.log("✅ Stop loss executed successfully");
              } else if (result.action === "SELL_ERROR") {
                elizaLogger.error("❌ Stop loss failed");
              }
              return [];
            }
          );
        }
      }

      _callback({
        text: `🚀 Data successfully analyzed`,
        action: "NOTHING",
      });

      return true;
    } catch (error) {
      console.error("❌ Error analyzing:", error);
      _callback({
        text: "There was an error.",
        action: "SELL_ERROR",
      });
      return false;
    }
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Check if we should sell any tokens.",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Analyzing holdings for potential sell opportunities.",
          action: "CHECK_SELL",
        },
      },
    ],
  ] as ActionExample[][],
} as Action;