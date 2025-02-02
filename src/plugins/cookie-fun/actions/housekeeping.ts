import { elizaLogger, ICacheManager, UUID } from "@elizaos/core";
import {
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  type Action,
} from "@elizaos/core";

export const housekeeping: Action = {
  name: "HOUSEKEEPING",
  similes: ["HOUSEKEEPING", "CLEANING", "MAINTENANCE"],
  description: "Selling at particular price point.",

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
      const runHousekeeping = async () => {
        elizaLogger.log("📡 Running housekeeping tasks...");

        // Actions to run periodically
        const actionsToRun = ["ANALYZE_DATA", "CHECK_SELL"]; 
        const actionMemories: Memory[] = actionsToRun.map((actionName) => ({
          id: `${_message.id}-${actionName}` as UUID,
          agentId: _runtime.agentId,
          userId: _message.userId,
          roomId: _message.roomId,
          createdAt: Date.now(),
          content: {
            text: `Executing ${actionName}`,
            action: actionName,
          },
        }));

        await _runtime.processActions(
          _message,
          actionMemories,
          _state,
          _callback
        );
      };

      // Initial run
      await runHousekeeping();

      // Set up interval (e.g., every 5 minutes)
      const INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
      setInterval(runHousekeeping, INTERVAL);

      return true;
    } catch (error) {
      console.error("❌ Error analyzing:", error);
      _callback({
        text: "There was an error: .",
        action: "DATA_ERROR",
      });

      return false;
    }
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Can you run the housekeeping tasks?",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Starting housekeeping tasks now. Please wait...",
          action: "HOUSEKEEPING",
        },
      },
    ],
    [
      {
        user: "{{user2}}",
        content: {
          text: "I need you to handle the housekeeping.",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Running housekeeping tasks like analyzing data and checking sell opportunities.",
          action: "HOUSEKEEPING",
        },
      },
    ],
    [
      {
        user: "{{user3}}",
        content: {
          text: "Execute the housekeeping routine.",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Housekeeping tasks are being executed now.",
          action: "HOUSEKEEPING",
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
