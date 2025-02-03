import { 
  elizaLogger, 
  type Action, 
  type IAgentRuntime, 
  type Memory,
  type State,
  type HandlerCallback 
} from "@elizaos/core";
import { TokenMetricsProvider } from "../providers/token-metrics-provider";
import { DexscreenerProvider } from "../providers/dexscreener-provider";
import { PROFIT_TARGET, STOP_LOSS } from "../config";
import BetterSQLite3 from "better-sqlite3";

export class CheckSellAction {
  private tokenMetricsProvider: TokenMetricsProvider;
  private dexscreenerProvider: DexscreenerProvider;
  private db: BetterSQLite3.Database;

  constructor() {
    this.db = new BetterSQLite3("data/db.sqlite");
    this.tokenMetricsProvider = new TokenMetricsProvider(this.db);
    this.dexscreenerProvider = new DexscreenerProvider();
  }

  async checkForSells() {
    try {
      const activeTrades = this.tokenMetricsProvider.getActiveTrades();
      elizaLogger.log(`📊 Checking ${activeTrades.length} active trades`);

      for (const trade of activeTrades) {
        try {
          const currentPriceData = await this.dexscreenerProvider.fetchTokenPrice(
            trade.tokenAddress
          );

          // Find the WETH pair
          const wethPair = currentPriceData.pairs?.find(
            p => p.quoteToken.symbol === "WETH"
          );

          if (!wethPair) {
            elizaLogger.error(`⚠️ No WETH pair found for ${trade.tokenAddress}`);
            continue;
          }

          const currentPriceInEth = parseFloat(wethPair.priceNative);

          if (!currentPriceInEth || !trade.entryPrice) {
            elizaLogger.error(`⚠️ Missing price data for ${trade.tokenAddress}`);
            continue;
          }

          const profitLossPercent = Math.round(
            ((currentPriceInEth - trade.entryPrice) / trade.entryPrice) * 100
          );

          elizaLogger.log(`📊 ${trade.symbol} current stats:`, {
            entryPrice: trade.entryPrice,
            currentPrice: currentPriceInEth,
            profitLoss: `${profitLossPercent}%`
          });

          // Check if we should mark for selling
          if (profitLossPercent >= PROFIT_TARGET || profitLossPercent <= STOP_LOSS) {
            elizaLogger.log(`🎯 Marking ${trade.symbol} for selling at ${profitLossPercent}% ${profitLossPercent >= PROFIT_TARGET ? 'profit' : 'loss'}`);
            
            this.tokenMetricsProvider.markForSelling(trade.tokenAddress, trade.chainId);
          }

        } catch (error) {
          elizaLogger.error(`❌ Error checking ${trade.symbol}:`, error);
        }
      }

      return true;
    } catch (error) {
      elizaLogger.error("❌ Error in check-sell execution:", error);
      return false;
    }
  }
}

export const checkSell: Action = {
  name: "CHECK_SELL",
  similes: ["CHECK", "CHECK SELL", "CHECK PROFITS", "CHECK TRADES"],
  description: "Check if any tokens should be sold based on profit/loss targets",

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
      const dexscreenerProvider = new DexscreenerProvider();

      const activeTrades = tokenMetricsProvider.getActiveTrades();
      elizaLogger.log(`📊 Checking ${activeTrades.length} active trades`);

      for (const trade of activeTrades) {
        try {
          const currentPriceData = await dexscreenerProvider.fetchTokenPrice(
            trade.tokenAddress
          );

          const wethPair = currentPriceData.pairs?.find(
            p => p.quoteToken.symbol === "WETH"
          );

          if (!wethPair) {
            elizaLogger.error(`⚠️ No WETH pair found for ${trade.tokenAddress}`);
            continue;
          }

          const currentPriceInEth = parseFloat(wethPair.priceNative);

          if (!currentPriceInEth || !trade.entryPrice) {
            elizaLogger.error(`⚠️ Missing price data for ${trade.tokenAddress}`);
            continue;
          }

          const profitLossPercent = Math.round(
            ((currentPriceInEth - trade.entryPrice) / trade.entryPrice) * 100
          );

          elizaLogger.log(`📊 ${trade.symbol} current stats:`, {
            entryPrice: trade.entryPrice,
            currentPrice: currentPriceInEth,
            profitLoss: `${profitLossPercent}%`
          });

          if (profitLossPercent >= PROFIT_TARGET || profitLossPercent <= STOP_LOSS) {
            elizaLogger.log(`🎯 Marking ${trade.symbol} for selling at ${profitLossPercent}% ${profitLossPercent >= PROFIT_TARGET ? 'profit' : 'loss'}`);
            tokenMetricsProvider.markForSelling(trade.tokenAddress, trade.chainId);
          }
        } catch (error) {
          elizaLogger.error(`❌ Error checking ${trade.symbol}:`, error);
        }
      }

      _callback({
        text: `Checked ${activeTrades.length} active trades for sell conditions`,
        action: "CHECK_COMPLETE",
      });

      return true;
    } catch (error) {
      elizaLogger.error("❌ Error in check-sell:", error);
      _callback({
        text: `Failed to check trades: ${error.message}`,
        action: "CHECK_ERROR",
      });
      return false;
    }
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Check if we should sell any tokens",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Checking sell conditions for active trades",
          action: "CHECK_SELL",
        },
      },
    ],
  ],
} as Action;