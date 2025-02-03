import { 
  elizaLogger, 
  type Action, 
  type IAgentRuntime, 
  type Memory,
  type State,
  type HandlerCallback 
} from "@elizaos/core";
import { TokenTrader } from "../services/token-trader.ts";
import { ACTIVE_CHAIN, TRADE_AMOUNT } from '../config.ts';

export const buyToken: Action = {
  name: "BUY_TOKEN",
  similes: ["BUY Token", 
    //"BUY", 
    // //"PURCHASE TOKEN"
     ],
  description: "Flag a token for buying",

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
      const trader = new TokenTrader();
      const result = await trader.processPendingBuys(runtime);

      if (callback) {
        if (result.success) {
          callback({
            text: `🛍️ Buy orders processed | ${result.symbol ? `Bought: ${result.symbol} | ` : ''}Amount per trade: ${TRADE_AMOUNT} ETH | Chain: ${ACTIVE_CHAIN} | Status: Transaction${result.symbol ? '' : 's'} complete`,
            action: "BUY_TOKEN_COMPLETE",
            data: {
              ...result,
              chain: ACTIVE_CHAIN,
              tradeAmount: TRADE_AMOUNT
            }
          });
        } else {
          callback({
            text: `❌ Failed to process buy orders: ${result.error}`,
            action: "BUY_TOKEN_ERROR"
          });
        }
      }

      return result.success;
    } catch (error) {
      elizaLogger.error("❌ Error in buy action:", error);
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
          amount: "0.1"
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Executing token purchase",
          action: "BUY_TOKEN",
        },
      },
    ],
  ],
} as Action; 