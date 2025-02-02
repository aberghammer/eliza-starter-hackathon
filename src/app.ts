import { elizaLogger, Memory, State, UUID, IAgentRuntime } from "@elizaos/core";
import { checkSell } from "./plugins/cookie-fun/actions/check-sell";
import { Scheduler } from "./services/scheduler";

export function initializeScheduler(runtime: IAgentRuntime, state: State) {
  // Create a memory object for the check-sell action
  const checkSellMemory: Memory = {
    id: crypto.randomUUID() as UUID,
    agentId: runtime.agentId,
    userId: crypto.randomUUID() as UUID,
    roomId: crypto.randomUUID() as UUID,
    createdAt: Date.now(),
    content: {
      text: "Periodic check for sell conditions",
      action: "CHECK_SELL",
      source: "scheduler"
    },
  };

  // Run check-sell every 5 minutes
  setInterval(async () => {
    await runtime.processActions(
      checkSellMemory,
      [checkSellMemory],
      state,
      async (result) => {  // Make callback async
        if (result.action === "SELL_ERROR") {
          elizaLogger.error("❌ Periodic check-sell failed");
        }
        return [];  // Return empty array for HandlerCallback
      }
    );
  }, 5 * 60 * 1000);

  const scheduler = new Scheduler(runtime, state);
  scheduler.start();
} 