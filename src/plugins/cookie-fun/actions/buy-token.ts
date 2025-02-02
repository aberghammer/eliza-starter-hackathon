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
import { Chain } from '../types/Chain';
import { ACTIVE_CHAIN, TRADE_AMOUNT } from '../config';



export const buyToken: Action = {
  name: "BUY_TOKEN",
  similes: ["BUY", "PURCHASE TOKEN", "EXECUTE BUY"],
  description: "Buys a token on Arbitrum (or other chains) using SushiSwap",

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
      let tokenAddress: string;
      let amountInEth: string;

      // Try to get from content object first
      if (typeof _message.content === 'object' && _message.content !== null) {
        tokenAddress = (_message.content as { tokenAddress?: string }).tokenAddress;
        amountInEth = (_message.content as { amountInEth?: string }).amountInEth || TRADE_AMOUNT;
      }

      // If not found, try to parse from text
      if (!tokenAddress) {
        const text = _message.content.text as string;
        // Match address (0x...)
        const addressMatch = text.match(/0x[a-fA-F0-9]{40}/);
        tokenAddress = addressMatch?.[0];
      }

      if (!tokenAddress) {
        throw new Error("Missing token address. Please specify the token to buy.");
      }

      // Use configured amount if not specified
      if (!amountInEth) {
        amountInEth = TRADE_AMOUNT;
      }
      
      // Make sure we're working with a valid number string
      const amountInWei = ethers.parseEther(amountInEth as string).toString();
      

      elizaLogger.log(`🔄 Starting token purchase for ${tokenAddress} with ${amountInEth} ETH`);

      // Get selected Chain configuration
      const selectedChain = (_message.content as any).chain || ACTIVE_CHAIN;
      const rpcUrl = _runtime.getSetting(`${selectedChain.toUpperCase()}_RPC_URL`);
      const privateKey = _runtime.getSetting(`${selectedChain.toUpperCase()}_WALLET_PRIVATE_KEY`);
      const routerAddress = _runtime.getSetting(`${selectedChain.toUpperCase()}_UNISWAP_ROUTER`);
      const wethAddress = _runtime.getSetting(`${selectedChain.toUpperCase()}_WETH`);

      if (!rpcUrl || !privateKey || !routerAddress || !wethAddress) {
        throw new Error(`Missing required ${selectedChain} configuration!`);
      }

      // Initialize trade executor
      const tradeExecutor = new TradeExecutionProvider(
        selectedChain,
        _runtime
      );

      // Execute the buy
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

      // And add explorer URLs for transaction link:
      const explorerUrls = {
        [Chain.ARBITRUM]: 'https://arbiscan.io/tx/',
        [Chain.MODE]: 'https://explorer.mode.network/tx/',
        [Chain.AVALANCHE]: 'https://snowtrace.io/tx/'
      };

      // Update callback text to use correct explorer
      _callback({
        text: `Successfully bought ${tokenAddress} for ${amountInEth} ETH\nTransaction: ${explorerUrls[selectedChain]}${tradeResult.tradeId}`.replace(/\n/g, ' '),
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
          text: "Executing token purchase",
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
          text: "Initiating token purchase",
          action: "BUY_TOKEN",
        },
      },
    ],
  ] as ActionExample[][],
} as Action; 