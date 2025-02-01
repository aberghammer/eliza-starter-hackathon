import { elizaLogger } from "@elizaos/core";
import {
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  type Action,
} from "@elizaos/core";
import { TradeExecutionProvider } from "../providers/trade-execution-provider.ts";
import { TokenMetricsProvider } from "../providers/token-metrics-provider.ts";
import BetterSQLite3 from "better-sqlite3";
import { ethers } from "ethers";



export const buyToken: Action = {
  name: "BUY_TOKEN",
  similes: ["BUY", "PURCHASE TOKEN", "EXECUTE BUY", "BUY ON ARBITRUM"],
  description: "Buys a token on Arbitrum using SushiSwap",

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

      const { tokenAddress, amountInEth } = _message.content;

      if (!tokenAddress || !amountInEth) {
        throw new Error("Missing required parameters");
      }

      // Log the entire message object
      elizaLogger.log("🔍 Full message:", {
        message: _message,
        contentType: typeof _message.content,
        hasContent: !!_message.content,
      });

      
      // Make sure we're working with a valid number string
      const amountInWei = ethers.parseEther(amountInEth as string).toString();
      

      elizaLogger.log(`🔄 Starting token purchase for ${tokenAddress} with ${amountInEth} ETH`);

      // Get Arbitrum configuration
      const rpcUrl = _runtime.getSetting("ARBITRUM_RPC_URL");
      const privateKey = _runtime.getSetting("ARBITRUM_WALLET_PRIVATE_KEY");
      const routerAddress = _runtime.getSetting("ARBITRUM_UNISWAP_ROUTER");
      const wethAddress = _runtime.getSetting("ARBITRUM_WETH");

      if (!rpcUrl || !privateKey || !routerAddress || !wethAddress) {
        throw new Error("Missing required Arbitrum configuration!");
      }

      // Initialize trade executor
      const tradeExecutor = new TradeExecutionProvider(
        rpcUrl,
        privateKey,
        routerAddress,
        wethAddress
      );

      // Execute the buy
      elizaLogger.log("🔄 Calling trade executor...");
      const tradeResult = await tradeExecutor.buyToken(
        tokenAddress as string,
        amountInWei
      );

      if (!tradeResult) {
        throw new Error("Trade execution returned null result");
      }


      // Update database with trade info
      const db = new BetterSQLite3("data/db.sqlite");
      const tokenMetricsProvider = new TokenMetricsProvider(db);

      const metrics = {
        tokenAddress: tokenAddress as string,
        symbol: tradeResult.symbol,
        mindshare: 0, // These will be updated by analyze-data
        sentimentScore: 0,
        liquidity: 0,
        priceChange24h: 0,
        holderDistribution: "",
        timestamp: new Date().toISOString(),
        buySignal: true,
        entryPrice: tradeResult.price,
      };

      tokenMetricsProvider.upsertTokenMetrics(metrics);

      _callback({
        text: `Successfully bought ${tokenAddress} for ${amountInEth} ETH`,
        action: "TOKEN_BOUGHT",
        data: tradeResult
      });

      return true;
    } catch (error) {
      elizaLogger.error("❌ Error buying token:", {
        error,
        message: error.message,
        stack: error.stack
      });
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
          text: "Buy this token for me",
          tokenAddress: "0x1234...",
          amountInEth: "0.00001"
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Executing token purchase on Arbitrum",
          action: "BUY_TOKEN",
        },
      },
    ],
    [
      {
        user: "{{user2}}",
        content: {
          text: "Execute a buy order",
          tokenAddress: "0x5678...",
          amountInEth: "0.0001"
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Initiating token purchase on Arbitrum",
          action: "BUY_TOKEN",
        },
      },
    ],
  ] as ActionExample[][],
} as Action; 