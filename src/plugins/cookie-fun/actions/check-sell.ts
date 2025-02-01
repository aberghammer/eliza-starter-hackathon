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
        const currentPrice = currentPriceData.price;

        if (!currentPrice) {
          elizaLogger.error(`⚠️ Kein Preis für ${trade.tokenAddress} gefunden`);
          continue;
        }

        const profitLossPercent = Math.round(
          ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
        );

        if (profitLossPercent >= 30) {
          elizaLogger.log(
            `✅ Verkaufe ${trade.symbol} mit +${profitLossPercent.toFixed(
              2
            )}% Gewinn!`
          );
          tokenMetricsProvider.updateExitPrice(
            trade.tokenAddress,
            currentPrice,
            profitLossPercent
          );
          // TODO: Implementiere Verkauf & Twitter-Update
          // TODO LUIGI: udatexitpreis  reinziehen

          const sellMemory: Memory = {
            id: `${_message.id}-sell` as UUID,
            agentId: _runtime.agentId,
            userId: _message.userId,
            roomId: _message.roomId,
            createdAt: Date.now(),
            content: {
              text: `Selling token ${trade.tokenAddress}`,
              action: "SELL_TOKEN",
              tokenAddress: trade.tokenAddress,
              source: "direct"
            },
          };

          await _runtime.processActions(
            sellMemory,
            [sellMemory],
            _state,
            async (result) => {
              if (result.action === "TOKEN_SOLD") {
                elizaLogger.log("✅ Sell action completed successfully");
              }
              return [];
            }
          );
        } else if (profitLossPercent <= -20) {
          elizaLogger.log(
            `⛔ Verkaufe ${trade.symbol} mit -${profitLossPercent.toFixed(
              2
            )}% Verlust!`
          );
          tokenMetricsProvider.updateExitPrice(
            trade.tokenAddress,
            currentPrice,
            profitLossPercent
          );
          // TODO: Implementiere Verkauf & Twitter-Update
        } else {
          elizaLogger.log(
            `📈 ${trade.symbol} hat aktuell +${profitLossPercent.toFixed(
              2
            )}% Gewinn und -${profitLossPercent.toFixed(2)}% Verlust`
          );
        }
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
