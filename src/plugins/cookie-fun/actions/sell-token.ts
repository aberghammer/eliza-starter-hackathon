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

export const sellToken: Action = {
  name: "SELL_TOKEN",
  similes: ["SELL", "DISPOSE TOKEN", "EXECUTE SELL", "SELL ON ARBITRUM", "MANUAL SELL", "triggerword"],
  description: "Sells a token on Arbitrum using SushiSwap",

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
      // Get active trades first
      const db = new BetterSQLite3("data/db.sqlite");
      const tokenMetricsProvider = new TokenMetricsProvider(db);
      const activeTrades = tokenMetricsProvider.getActiveTrades();

      if (activeTrades.length === 0) {
        throw new Error("No active trades found to sell");
      }

      // Get the first active trade if no specific token provided
      const tokenToSell = activeTrades[0];
      let tokenAddress: string;

      // Try to get from content object first
      if (typeof _message.content === 'object' && _message.content !== null) {
        tokenAddress = (_message.content as { tokenAddress?: string }).tokenAddress;
      }

      // If not found, try to parse from text
      if (!tokenAddress) {
        const text = _message.content.text as string;
        // Match address (0x...)
        const addressMatch = text.match(/0x[a-fA-F0-9]{40}/);
        tokenAddress = addressMatch?.[0] || tokenToSell.tokenAddress;
      }

      if (!tokenAddress) {
        throw new Error("No valid token address found");
      }

      elizaLogger.log(`🔄 Using token address: ${tokenAddress}`);

      // Get token balance
      const rpcUrl = _runtime.getSetting("ARBITRUM_RPC_URL");
      const privateKey = _runtime.getSetting("ARBITRUM_WALLET_PRIVATE_KEY");
      const routerAddress = _runtime.getSetting("ARBITRUM_UNISWAP_ROUTER");
      const wethAddress = _runtime.getSetting("ARBITRUM_WETH");

      if (!rpcUrl || !privateKey || !routerAddress || !wethAddress) {
        throw new Error("Missing required Arbitrum configuration!");
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

      elizaLogger.log(`🔄 Starting token sale for ${tokenAddress} with balance ${balance}`);

      const tradeExecutor = new TradeExecutionProvider(
        rpcUrl,
        privateKey,
        routerAddress,
        wethAddress
      );

      // Execute the sell with full balance
      const tradeResult = await tradeExecutor.sellToken(
        tokenAddress,
        balance.toString()
      );

      if (!tradeResult) {
        throw new Error("Trade execution returned null result");
      }

      // Calculate profit/loss percentage
      const trade = activeTrades.find(t => t.tokenAddress === tokenAddress);
      if (!trade || !trade.entryPrice) {
        throw new Error("Could not find entry price for trade");
      }

      // Calculate percentage: ((exitPrice - entryPrice) / entryPrice) * 100
      const exitPrice = tradeResult.price;
      const profitLossPercent = Math.round(
        ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100
      );

      elizaLogger.log(`📊 Profit/Loss calculation:`, {
        entryPrice: trade.entryPrice,
        exitPrice: exitPrice,
        profitLossPercent: `${profitLossPercent}%`
      });

      // Update database with trade info
      tokenMetricsProvider.updateExitPrice(tokenAddress, exitPrice, profitLossPercent);

      _callback({
        text: `Successfully sold ${tradeResult.symbol} for ${ethers.formatEther(balance)} tokens at price ${exitPrice} (${profitLossPercent > 0 ? '+' : ''}${profitLossPercent}%)\nTransaction: https://arbiscan.io/tx/${tradeResult.tradeId}`.replace(/\n/g, ' '),
        action: "TOKEN_SOLD",
        data: {
          ...tradeResult,
          profitLossPercent
        }
      });

      return true;
    } catch (error) {
      elizaLogger.error("❌ Error selling token:", {
        error,
        message: error.message,
        stack: error.stack
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
          amountToSell: "1000000000000000000" // 1 token in wei
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