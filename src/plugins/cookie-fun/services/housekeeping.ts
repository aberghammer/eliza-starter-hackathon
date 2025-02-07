import {
  elizaLogger,
  type IAgentRuntime,
  type HandlerCallback,
} from "@elizaos/core";
import { TokenTrader } from "./token-trader.ts";
import { analyzeData } from "../actions/analyze-data.ts";
import { Memory, State } from "@elizaos/core";
import { checkSell } from "../actions/check-sell.ts";
import { analyzeMarket } from "../actions/analyze-market.ts";
import { tweetMindshare } from "../actions/tweet-mindshare.ts";

export class HousekeepingService {
  private trader: TokenTrader;
  private runtime: IAgentRuntime;

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
    this.trader = new TokenTrader(this.runtime);
  }

  async runCycle(
    runtime: IAgentRuntime,
    callback?: HandlerCallback
  ): Promise<boolean> {
    elizaLogger.log("🔄 Running housekeeping cycle...");

    try {
      await analyzeMarket.handler(
        runtime,
        {} as Memory,
        {} as State,
        {},
        callback
      );

      // Step 1: Analyze market data and set buy signals
      elizaLogger.log("📊 Running market analysis...");
      await analyzeData.handler(
        runtime,
        {} as Memory,
        {} as State,
        {},
        callback
      );

      // Step 2: Process any tokens marked for buying
      elizaLogger.log("🛍️ Processing pending buys...");
      await this.trader.processPendingBuys(runtime);

      // Step 3: Check active trades for sell signals
      await checkSell.handler(runtime, {} as Memory, {} as State, {}, callback);

      // Step 4: Process any tokens marked for selling
      elizaLogger.log("💰 Processing pending sells...");
      await this.trader.processPendingSells(runtime);

      // Step 5: Post mindshare updates to Twitter
      elizaLogger.log("📢 Posting mindshare updates...");
      await tweetMindshare.handler(
        runtime,
        {} as Memory,
        {} as State,
        {},
        callback
      );

      elizaLogger.log("✅ Housekeeping cycle completed");

      if (callback) {
        callback({
          text: "✅ Market analysis complete | Buy signals checked | Active trades monitored | Orders processed | Mindshare tweeted | System optimized and ready for next cycle",
          action: "HOUSEKEEPING_COMPLETE",
        });
      }

      return true;
    } catch (error) {
      elizaLogger.error("❌ Error in housekeeping cycle:", error);

      if (callback) {
        callback({
          text: `Failed to run housekeeping: ${error.message}`,
          action: "HOUSEKEEPING_ERROR",
        });
      }

      return false;
    }
  }
}
