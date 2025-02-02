import { elizaLogger, ICacheManager, UUID } from "@elizaos/core";
import {
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  type Action,
} from "@elizaos/core";
import { Chain } from '../types/Chain';

export const housekeeping: Action = {
  name: "HOUSEKEEPING",
  similes: ["HOUSEKEEPING", "CLEANING", "MAINTENANCE"],
  description: "Periodic maintenance tasks.",

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

      
      //-------------------------------Stellschrauben--------------------------------
      const loopAfterXMinutes = 60; // How often to run housekeeping tasks
      const activeChain = Chain.ARBITRUM; // Which blockchain to use (ARBITRUM or MODE)
      //-------------------------------Stellschrauben--------------------------------


      const runHousekeeping = async () => {
        elizaLogger.log("📡 Running housekeeping tasks...");

        // Define which actions to run periodically
        const actionsToRun = ["ANALYZE_DATA", "CHECK_SELL"];

        // Create memory objects for each action
        const actionMemories: Memory[] = actionsToRun.map(actionName => ({
          id: `${_message.id}-${actionName.toLowerCase()}` as UUID,
          agentId: _runtime.agentId,
          userId: _message.userId,
          roomId: _message.roomId,
          createdAt: Date.now(),
          content: {
            text: `Running periodic ${actionName}`,
            action: actionName,
            source: "housekeeping",
            chain: activeChain
          },
        }));

        // Execute all actions
        for (const memory of actionMemories) {
          await _runtime.processActions(
            memory,
            [memory],
            _state,
            async (result) => {
              if (result.action?.includes("ERROR")) {
                elizaLogger.error(`❌ Housekeeping ${memory.content.action} failed`);
              }
              return [];  // Return empty array to satisfy Promise<Memory[]>
            }
          );
        }
      };

      // Initial run
      await runHousekeeping();
      elizaLogger.log("✅ Housekeeping tasks completed successfully");

      // Run every 5 minutes
      const INTERVAL = loopAfterXMinutes * 60 * 1000; // 5 minutes in milliseconds
      setInterval(runHousekeeping, INTERVAL);

      return true;
    } catch (error) {
      elizaLogger.error("❌ Error in housekeeping:", error);
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
