import { elizaLogger, ICacheManager } from "@elizaos/core";
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

        if (!currentPriceData || !currentPriceData.price) {
          elizaLogger.error(`⚠️ No price data found for ${trade.tokenAddress}`);
          continue;
        }

        // Get current price in ETH (convert from USD using current ETH price ~$3000)
        const ETH_PRICE = 3000; // This should be fetched dynamically
        const currentPriceInEth = currentPriceData.price / ETH_PRICE;

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
          currentPriceUsd: currentPriceData.price,
          liquidity: currentPriceData.liquidity,
          profitLoss: `${profitLossPercent}%`
        });

        if (profitLossPercent >= 0) { //30
          elizaLogger.log(`✅ Selling ${trade.symbol} with +${profitLossPercent.toFixed(2)}% profit!`);

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
        } else if (profitLossPercent <= -1) { //20
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
        } else {
          const profitLossText = profitLossPercent >= 0 
            ? `+${profitLossPercent.toFixed(2)}% Gewinn` 
            : `${profitLossPercent.toFixed(2)}% Verlust`;
            
          elizaLogger.log(
            `📈 ${trade.symbol} hat aktuell ${profitLossText}`
          );
        }

        elizaLogger.log(`Found price on ${trade.symbol}:`, {
          priceNative: currentPriceInEth,
          priceUsd: currentPriceData.price,
          liquidity: currentPriceData.liquidity
        });
      }

      //TODO:

      //const tradeExecutionProvider = new TradeExecutionProvider(...);
      //const holdingList = tradeExecutionProvider.checkMyHoldings();
      //holdingList.map((holding) => {
      // check if we should sell
      // if (holding.price > ... || < ... sell ) { }      //
      // const coins sold = ...

      // token wird verkauft wenn die analyse positiv ist und dann wird getwittert
      // const twitterProvider = new TwitterProvider(...);
      // if coins sold > 0  && twitterProvider.tweet("I just bought the token");

      _callback({
        text: `🚀 Data sucessfully analyzed`,
        action: "NOTHING",
      });

      return true;
    } catch (error) {
      console.error("❌ Error analyzing:", error);
      _callback({
        text: "There was an error: .",
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
          text: "Can you check if it's time to sell my tokens?",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Let me analyze your holdings for potential sales opportunities.",
          action: "CHECK_SELL",
        },
      },
    ],
    [
      {
        user: "{{user2}}",
        content: {
          text: "Sell my tokens if they meet the criteria.",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Checking your tokens for selling opportunities based on your criteria.",
          action: "CHECK_SELL",
        },
      },
    ],
    [
      {
        user: "{{user3}}",
        content: {
          text: "Are there any tokens to sell?",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Analyzing your holdings to determine if any tokens should be sold.",
          action: "CHECK_SELL",
        },
      },
    ],
    [
      {
        user: "{{user4}}",
        content: {
          text: "Look for tokens with profit or loss triggers and sell them.",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "I'm checking your portfolio for tokens that meet the sell criteria.",
          action: "CHECK_SELL",
        },
      },
    ],
    [
      {
        user: "{{user5}}",
        content: {
          text: "Can you trigger the sell check for my holdings?",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Sure! Initiating the sell check for your tokens.",
          action: "CHECK_SELL",
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
