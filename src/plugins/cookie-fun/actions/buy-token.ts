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
  similes: ["BUY", "PURCHASE TOKEN"],
  description: "Buy a token",

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
      // Extract parameters from message
      const content = _message.content as any;
      const tokenAddress = content.tokenAddress || content.text?.match(/0x[a-fA-F0-9]{40}/)?.[0];
      const chainName = content.chain || ACTIVE_CHAIN;
      const amount = content.amount || TRADE_AMOUNT;

      if (!tokenAddress) {
        throw new Error("Missing token address. Please specify the token to buy.");
      }

      // Execute trade using TokenTrader service
      const trader = new TokenTrader();
      const result = await trader.manualBuy({
        tokenAddress,
        chainName,
        amount,
        runtime: _runtime,
        callback: _callback
      });

      return result.success;
    } catch (error) {
      elizaLogger.error("❌ Error in buy action:", error);
      _callback({
        text: `Failed to buy token: ${error.message}`,
        action: "BUY_ERROR",
      });
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