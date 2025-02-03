import { elizaLogger } from "@elizaos/core";
import {
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  type Action,
} from "@elizaos/core";
import { TradeExecutionProvider } from "../providers/trade-execution-provider.ts";

import { ethers } from "ethers";
import { Chain } from "../types/Chain.ts";
import { ACTIVE_CHAIN } from "../config.ts";
import { stringToChain } from "../utils/chain-utils.ts";
import { TokenMetricsProvider } from "../providers/token-metrics-provider-psql.ts";

export const sellToken: Action = {
  name: "SELL_TOKEN",
  similes: [
    "SELL",
    "DISPOSE TOKEN",
    "EXECUTE SELL",
    "SELL ON ARBITRUM",
    "MANUAL SELL",
    "triggerword",
  ],
  description: "Sells a token on a given Chain using SushiSwap",

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
      const tokenMetricsProvider = new TokenMetricsProvider(
        _runtime.getSetting("DB_CONNECTION_STRING")
      );

      const activeTrades = await tokenMetricsProvider.getActiveTrades();

      if (activeTrades.length === 0) {
        throw new Error("No active trades found to sell");
      }

      // Get the first active trade if no specific token provided
      const tokenToSell = activeTrades[0];
      let tokenAddress: string;

      // Try to get from content object first
      if (typeof _message.content === "object" && _message.content !== null) {
        tokenAddress = (_message.content as { tokenAddress?: string })
          .tokenAddress;
      }

      // If not found, try to parse from text
      if (!tokenAddress) {
        const text = _message.content.text as string;
        // Match address (0x...)
        const addressMatch = text.match(/0x[a-fA-F0-9]{40}/);
        tokenAddress = addressMatch?.[0] || tokenToSell.token_address;
      }

      if (!tokenAddress) {
        throw new Error("No valid token address found");
      }

      elizaLogger.log(`🔄 Using token address: ${tokenAddress}`);

      // Get selected Chain configuration
      const selectedChain = (_message.content as any).chain || ACTIVE_CHAIN;
      const rpcUrl = _runtime.getSetting(
        `${selectedChain.toUpperCase()}_RPC_URL`
      );
      const privateKey = _runtime.getSetting(
        `${selectedChain.toUpperCase()}_WALLET_PRIVATE_KEY`
      );
      const routerAddress = _runtime.getSetting(
        `${selectedChain.toUpperCase()}_UNISWAP_ROUTER`
      );
      const wethAddress = _runtime.getSetting(
        `${selectedChain.toUpperCase()}_WETH`
      );

      if (!rpcUrl || !privateKey || !routerAddress || !wethAddress) {
        throw new Error(`Missing required ${selectedChain} configuration!`);
      }

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(privateKey, provider);

      // Get token balance
      const tokenAbi = ["function balanceOf(address) view returns (uint256)"];
      const token = new ethers.Contract(tokenAddress, tokenAbi, provider);
      const balance = await token.balanceOf(wallet.address);

      if (balance === BigInt(0)) {
        throw new Error("No token balance to sell");
      }

      elizaLogger.log(
        `🔄 Starting token sale for ${tokenAddress} with balance ${balance}`
      );

      const tradeExecutor = new TradeExecutionProvider(
        stringToChain(selectedChain),
        _runtime
      );

      // Execute the sell with full balance
      const tradeResult = await tradeExecutor.sellToken(
        tokenAddress,
        balance.toString()
      );

      if (!tradeResult) {
        throw new Error("Trade execution returned null result");
      }

      // Calculate profit/loss percentage and update database
      const trade = activeTrades.find((t) => t.token_address === tokenAddress);
      if (!trade || !trade.entry_price) {
        throw new Error("Could not find entry price for trade");
      }

      // Calculate percentage: ((exitPrice - entryPrice) / entryPrice) * 100
      const exitPrice = tradeResult.price;
      const profitLossPercent = Math.round(
        ((exitPrice - trade.entry_price) / trade.entry_price) * 100
      );

      elizaLogger.log(`📊 Profit/Loss calculation:`, {
        entryPrice: trade.entry_price,
        exitPrice: exitPrice,
        profitLossPercent: `${profitLossPercent}%`,
      });

      // Update database with trade info
      tokenMetricsProvider.updateExitPrice(
        tokenAddress,
        exitPrice,
        profitLossPercent
      );

      const explorerUrls = {
        [Chain.ARBITRUM]: "https://arbiscan.io/tx/",
        [Chain.MODE]: "https://explorer.mode.network/tx/",
        [Chain.AVALANCHE]: "https://snowtrace.io/tx/",
      };

      if (tradeResult) {
        _callback({
          text: `📝 Token queued for selling | Token: ${tradeResult.symbol} | Chain: ${ACTIVE_CHAIN} | Status: Ready to execute on next cycle`,
          action: "SELL_TOKEN_QUEUED",
          data: {
            ...tradeResult,
            chain: ACTIVE_CHAIN,
          },
        });
      } else {
        _callback({
          text: `❌ Failed to queue token for selling: Trade execution failed`,
          action: "SELL_TOKEN_ERROR",
        });
      }

      return true;
    } catch (error) {
      elizaLogger.error("❌ Error selling token:", {
        error,
        message: error.message,
        stack: error.stack,
      });
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
          text: "Sell this token for me",
          tokenAddress: "0x1234...",
          amountToSell: "1000000000000000000", // 1 token in wei
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Executing token sale on Arbitrum",
          action: "SELL_TOKEN",
        },
      },
    ],
  ] as ActionExample[][],
} as Action;

export class SellTokenAction {
  private tokenMetricsProvider: TokenMetricsProvider;

  constructor(runtime: IAgentRuntime) {
    const tokenMetricsProvider = new TokenMetricsProvider(
      runtime.getSetting("DB_CONNECTION_STRING")
    );
  }

  async executeSell(runtime: IAgentRuntime) {
    try {
      // Get tokens marked for selling
      const tokensToSell = await this.tokenMetricsProvider.getTokensToSell();

      for (const token of tokensToSell) {
        try {
          // Initialize trade executor for this chain
          const tradeExecutor = new TradeExecutionProvider(
            stringToChain(token.chain_name),
            runtime
          );

          // Get token balance
          const provider = new ethers.JsonRpcProvider(
            runtime.getSetting(`${token.chain_name.toUpperCase()}_RPC_URL`)
          );
          const wallet = new ethers.Wallet(
            runtime.getSetting(
              `${token.chain_name.toUpperCase()}_WALLET_PRIVATE_KEY`
            ),
            provider
          );

          const tokenContract = new ethers.Contract(
            token.token_address,
            ["function balanceOf(address) view returns (uint256)"],
            provider
          );

          const balance = await tokenContract.balanceOf(wallet.address);

          if (balance === BigInt(0)) {
            elizaLogger.error(`No balance to sell for ${token.symbol}`);
            continue;
          }

          // Execute the sell
          const tradeResult = await tradeExecutor.sellToken(
            token.token_address,
            balance.toString()
          );

          if (!tradeResult) {
            elizaLogger.error(`Failed to sell ${token.symbol}`);
            continue;
          }

          // Calculate profit/loss
          const profitLossPercent = Math.round(
            ((tradeResult.price - token.entry_price!) / token.entry_price!) *
              100
          );

          // Finalize the trade in database
          this.tokenMetricsProvider.finalizeTrade(
            token.token_address,
            token.chain_id,
            tradeResult.price,
            profitLossPercent
          );

          elizaLogger.log(
            `✅ Sold ${token.symbol} at ${profitLossPercent}% ${
              profitLossPercent >= 0 ? "profit" : "loss"
            }`
          );
        } catch (error) {
          elizaLogger.error(`❌ Error selling ${token.symbol}:`, error);
        }
      }

      return true;
    } catch (error) {
      elizaLogger.error("❌ Error in sell execution:", error);
      return false;
    }
  }
}
