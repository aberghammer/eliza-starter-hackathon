import { elizaLogger, ICacheManager } from "@elizaos/core";
import {
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  type Action,
} from "@elizaos/core";

export const checkSell: Action = {
  name: "CHECK_SELL",
  similes: ["SELL TOKEN", "CHECK SELL TOKEN", "SELL NOW"],
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
          text: "I’m checking your portfolio for tokens that meet the sell criteria.",
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
