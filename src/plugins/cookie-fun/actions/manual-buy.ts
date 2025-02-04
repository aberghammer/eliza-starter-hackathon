import {
  elizaLogger,
  type Action,
  type ActionExample,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
} from "@elizaos/core";
import { TRADE_AMOUNT } from "../config.ts";

import { TokenTrader } from "../services/token-trader.ts";
import { ACTIVE_CHAIN } from "../config.ts";

export const manualBuy: Action = {
  name: "MANUAL_BUY",
  similes: ["BUY", "PURCHASE", "MANUAL BUY"],
  description: "Manually buy a token on specified chain",

  validate: async (_runtime: IAgentRuntime, _message: Memory) => {
    return true;
  },

  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<boolean> => {
    try {
      const content = _message.content as any;
      const tokenAddress =
        content.tokenAddress || content.text?.match(/0x[a-fA-F0-9]{40}/)?.[0];
      const chainName = content.chain || ACTIVE_CHAIN;
      const amount =
        content.text?.match(/(\d*\.?\d+)\s*eth/i)?.[1] ||
        content.amount ||
        TRADE_AMOUNT;

      const trader = new TokenTrader(_runtime);
      const result = await trader.manualBuy({
        tokenAddress,
        chainName,
        amount,
        runtime: _runtime,
        callback,
      });

      if (callback) {
        callback({
          text: `🛍️ Manual buy executed | Token: ${result.symbol} (${tokenAddress}) | Amount: ${amount} ETH | Price: ${result.price} | Chain: ${chainName} | TX: ${result.tradeId}`,
          action: "MANUAL_BUY_COMPLETE",
          data: {
            ...result,
            chainName,
            amount,
          },
        });
      }

      return result.success;
    } catch (error) {
      elizaLogger.error("❌ Error in manual buy:", error);
      if (callback) {
        callback({
          text: `Failed to buy token: ${error.message}`,
          action: "BUY_ERROR",
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
          text: "Buy this token",
          tokenAddress: "0x1234...",
          chain: "arbitrum",
          amount: "0.1",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Executing manual token purchase",
          action: "MANUAL_BUY",
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
