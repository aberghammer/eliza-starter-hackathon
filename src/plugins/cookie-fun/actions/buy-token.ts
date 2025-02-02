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
import { TokenMetrics } from "../types/TokenMetrics.ts";

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
      const db = new BetterSQLite3("data/db.sqlite");
      const tokenMetricsProvider = new TokenMetricsProvider(db);

      // Get Arbitrum configuration
      const rpcUrl = _runtime.getSetting("ARBITRUM_RPC_URL");
      const privateKey = _runtime.getSetting("ARBITRUM_WALLET_PRIVATE_KEY");
      const routerAddress = _runtime.getSetting("ARBITRUM_UNISWAP_ROUTER");
      const wethAddress = _runtime.getSetting("ARBITRUM_WETH");
      const amountInETH = _runtime.getSetting("AMOUNT_IN_ETH");
      const amountInSol = _runtime.getSetting("AMOUNT_IN_SOL");

      if (!rpcUrl || !privateKey || !routerAddress || !wethAddress) {
        throw new Error("Missing required Arbitrum configuration!");
      }

      const tokensToBuy: TokenMetrics[] = tokenMetricsProvider.getShouldBuy();

      for (const token of tokensToBuy) {
        const tokenAddress = token.tokenAddress;

        const chain = token.chainId;

        if (!tokenAddress || !chain) {
          //⚠️⚠️⚠️ TODO delete entry from database
          continue; // Skip if missing required data
        }

        if (chain === 42161) {
          // Arbitrum

          if (!amountInETH) {
            //⚠️⚠️⚠️ TODO delete entry from database
            continue; // Skip if missing required data
          }

          const amountInWei = ethers
            .parseEther(amountInETH as string)
            .toString();

          elizaLogger.log(
            `🔄 Starting token purchase for ${tokenAddress} with ${amountInETH} ETH`
          );

          // Initialize trade executor
          const tradeExecutor = new TradeExecutionProvider(
            rpcUrl,
            privateKey,
            routerAddress,
            wethAddress
          );

          // Execute the buy ⚠️ rename to buyTokenInArbitrum oder generell Provider für Arbitrum und Solana gesondert erstellen und benennen
          const tradeResult = await tradeExecutor.buyToken(
            tokenAddress as string,
            amountInWei
          );

          if (!tradeResult) {
            throw new Error("Trade execution returned null result");
          }

          token.entryPrice = tradeResult.price; // Save entry price

          tokenMetricsProvider.upsertTokenMetrics(token); // Update token metrics

          _callback({
            text: `Successfully bought ${tokenAddress} for ${amountInETH} ETH\nTransaction: https://arbiscan.io/tx/${tradeResult.tradeId}`.replace(
              /\n/g,
              " "
            ),
            action: "TOKEN_BOUGHT",
            data: tradeResult,
          });
        }

        //else if chain === SOLANA...
        else {
          //⚠️⚠️⚠️ TODO delete entry from database
          elizaLogger.error(
            `❌ Chain ${chain} is not supported for token purchase. Skipping...`
          );
          continue; // Skip if not on Arbitrum
        }
      }

      return true;
    } catch (error) {
      elizaLogger.error("❌ Error buying token:", {
        error,
        message: error.message,
        stack: error.stack,
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
          text: "Buy the tokens for me",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Executing token purchases",
          action: "BUY_TOKEN",
        },
      },
    ],
    [
      {
        user: "{{user2}}",
        content: {
          text: "Execute a buy order",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Initiating token purchases",
          action: "BUY_TOKEN",
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
