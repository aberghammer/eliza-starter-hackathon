import { 
  elizaLogger, 
  type Action, 
  type ActionExample,
  type IAgentRuntime, 
  type Memory,
  type State,
  type HandlerCallback 
} from "@elizaos/core";
import { TradeExecutionProvider } from "../providers/trade-execution-provider.ts";
import { TokenMetricsProvider } from "../providers/token-metrics-provider.ts";
import { TRADE_AMOUNT } from "../config.ts";
import { getChainId } from '../utils/chain-utils.ts';
import BetterSQLite3 from "better-sqlite3";
import { ethers } from "ethers";

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
    _callback: HandlerCallback
  ): Promise<boolean> => {
    try {
      const content = _message.content as any;
      const tokenAddress = content.tokenAddress;
      const chainName = content.chain || 'arbitrum';
      const amount = content.amount || TRADE_AMOUNT;

      if (!tokenAddress) {
        throw new Error("Token address is required");
      }

      const tradeExecutor = new TradeExecutionProvider(chainName, _runtime);
      const amountInWei = ethers.parseEther(amount);
      
      const tradeResult = await tradeExecutor.buyToken(
        tokenAddress,
        amountInWei.toString()
      );

      if (!tradeResult) {
        throw new Error("Trade execution failed");
      }

      // Save to database
      const db = new BetterSQLite3("data/db.sqlite");
      const tokenMetricsProvider = new TokenMetricsProvider(db);

      const metrics = {
        tokenAddress,
        chainId: getChainId(chainName),
        chainName,
        symbol: tradeResult.symbol,
        mindshare: 0,
        sentimentScore: 0,
        liquidity: 0,
        priceChange24h: 0,
        holderDistribution: "",
        timestamp: new Date().toISOString(),
        buySignal: false,
        entryPrice: tradeResult.price,
        finalized: false
      };

      tokenMetricsProvider.upsertTokenMetrics(metrics);

      _callback({
        text: `Successfully bought ${tradeResult.symbol} for ${amount} on ${chainName}`,
        action: "TOKEN_BOUGHT",
        data: tradeResult
      });

      return true;
    } catch (error) {
      elizaLogger.error("❌ Error in manual buy:", error);
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
          text: "Executing manual token purchase",
          action: "MANUAL_BUY",
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
