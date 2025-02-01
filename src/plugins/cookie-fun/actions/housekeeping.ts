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
      elizaLogger.log("📡 Running everything every few minutes");

      //TODO:

      // Actions definieren
      const actionsToRun = ["ANALYZE_DATA", "TWEET_MINDSHARE"];
      const actionMemories: Memory[] = actionsToRun.map((actionName) => ({
        id: `${_message.id}-${actionName}` as UUID,
        agentId: _runtime.agentId,
        userId: _message.userId,
        roomId: _message.roomId,
        createdAt: Date.now(),
        content: {
          text: `Executing ${actionName}`,
          action: actionName, // **Hier liegt die Änderung!** 🔥
        },
      }));

      // `processActions()` ausführen mit den Dummy-Responses
      await _runtime.processActions(
        _message,
        actionMemories,
        _state,
        _callback
      );

      elizaLogger.log("✅ All actions completed successfully!");

      // run in loop and call
      // await runtime.callAction("SECOND_ACTION", { someData: "data" });
      // also eigentlich sollte es dann reichen hier analyzeData aufzurufen und dann checkSell
      // keine Ahnung ob das so geht lol...

      _callback({
        text: `🚀 Everything is running`,
        action: "NOTHING",
      });

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
