import { elizaLogger, type IAgentRuntime, type HandlerCallback } from "@elizaos/core";
import { TokenTrader } from "./token-trader";

export class HousekeepingService {
  private trader: TokenTrader;

  constructor() {
    this.trader = new TokenTrader();
  }

  async runCycle(runtime: IAgentRuntime, callback?: HandlerCallback): Promise<boolean> {
    elizaLogger.log("🔄 Running housekeeping cycle...");

    try {
      // Process pending buys
      await this.trader.processPendingBuys(runtime);

      // Process pending sells
      await this.trader.processPendingSells(runtime);

      elizaLogger.log("✅ Housekeeping cycle completed");
      
      if (callback) {
        callback({
          text: "Completed housekeeping tasks",
          action: "HOUSEKEEPING_COMPLETE"
        });
      }

      return true;
    } catch (error) {
      elizaLogger.error("❌ Error in housekeeping cycle:", error);
      
      if (callback) {
        callback({
          text: `Failed to run housekeeping: ${error.message}`,
          action: "HOUSEKEEPING_ERROR"
        });
      }

      return false;
    }
  }
} 