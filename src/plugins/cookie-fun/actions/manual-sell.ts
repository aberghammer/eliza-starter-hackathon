import { 
  elizaLogger, 
  type Action, 
  type IAgentRuntime, 
  type Memory,
  type State,
  type HandlerCallback 
} from "@elizaos/core";
import { TokenTrader } from "../services/token-trader.ts";
import { ACTIVE_CHAIN } from '../config.ts';

export const manualSell: Action = {
  name: "MANUAL_SELL",
  similes: ["SELL", "DISPOSE", "MANUAL SELL"],
  description: "Manually sell a token",

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

      if (!tokenAddress) {
        throw new Error("Missing token address. Please specify the token to sell.");
      }

      // Execute trade using TokenTrader service
      const trader = new TokenTrader();
      const result = await trader.manualSell({
        tokenAddress,
        chainName,
        runtime: _runtime,
        callback: _callback
      });

      if (result.success) {
        _callback({
          text: `💰 Manual sell executed | Token: ${result.symbol} (${tokenAddress}) | Amount: ${result.tokensSpent} | Price: ${result.price} | Chain: ${chainName} | P/L: ${result.profitLossPercent}% | TX: ${result.tradeId}`,
          action: "MANUAL_SELL_COMPLETE",
          data: {
            ...result,
            chainName,
            tokenAddress
          }
        });
      }

      return result.success;
    } catch (error) {
      elizaLogger.error("❌ Error in sell action:", error);
      _callback({
        text: `Failed to sell token: ${error.message}`,
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
          text: "Sell this token",
          tokenAddress: "0x1234...",
          chain: "arbitrum"
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Executing token sale",
          action: "MANUAL_SELL",
        },
      },
    ],
  ],
} as Action; 