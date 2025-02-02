import { elizaLogger, Memory, State, UUID } from "@elizaos/core";
import { IAgentRuntime } from "@elizaos/core";

export class Scheduler {
  private intervals: NodeJS.Timeout[] = [];

  constructor(private runtime: IAgentRuntime, private state: State) {}

  start() {
    // Check sell conditions every 5 minutes
    this.addInterval(5 * 60 * 1000, "CHECK_SELL", "Periodic check for sell conditions");
    
    // Could add other periodic tasks here
    // this.addInterval(15 * 60 * 1000, "UPDATE_PRICES", "Update price data");
  }

  private addInterval(ms: number, action: string, text: string) {
    const memory: Memory = {
      id: crypto.randomUUID() as UUID,
      agentId: this.runtime.agentId,
      userId: crypto.randomUUID() as UUID,
      roomId: crypto.randomUUID() as UUID,
      createdAt: Date.now(),
      content: { text, action, source: "scheduler" }
    };

    const interval = setInterval(async () => {
      elizaLogger.log(`🕒 Running scheduled ${action}`);
      
      await this.runtime.processActions(
        memory,
        [memory],
        this.state,
        async (result) => {
          if (result.action?.includes("ERROR")) {
            elizaLogger.error(`❌ Scheduled ${action} failed`);
          }
          return [];
        }
      );
    }, ms);

    this.intervals.push(interval);
  }

  stop() {
    this.intervals.forEach(clearInterval);
    this.intervals = [];
  }
} 