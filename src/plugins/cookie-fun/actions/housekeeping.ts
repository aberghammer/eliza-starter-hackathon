import { 
  elizaLogger, 
  type Action, 
  type IAgentRuntime, 
  type Memory,
  type State,
  type HandlerCallback 
} from "@elizaos/core";
import { HousekeepingService } from "../services/housekeeping.ts";
import { HOUSEKEEPING_MINUTES } from "../config.ts";

export const housekeeping: Action = {
  name: "HOUSEKEEPING",
  similes: ["HOUSEKEEPING", "MAINTENANCE", "RUN TASKS", "START HOUSEKEEPING", "AUTOMATIC"],
  description: "Run automated trading tasks. Use 'loop' parameter to run continuously",

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
      const service = new HousekeepingService();
      const result = await service.runCycle(_runtime, _callback);
      
      // Check if loop parameter was passed
      const shouldLoop = (_message.content as any).text?.toLowerCase().includes('loop');

      if (result && shouldLoop && !global.housekeepingInterval) {
        global.housekeepingInterval = setInterval(
          () => service.runCycle(_runtime, _callback),
          HOUSEKEEPING_MINUTES * 60 * 1000
        );
        _callback?.({
          text: `✅ Housekeeping will run every ${HOUSEKEEPING_MINUTES} minutes`,
          action: "HOUSEKEEPING_SCHEDULED"
        });
      }

      return result;
    } catch (error) {
      elizaLogger.error("Error in housekeeping:", error);
      return false;
    }
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Run housekeeping tasks with loop",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Starting continuous housekeeping tasks",
          action: "HOUSEKEEPING",
        },
      },
    ],
  ],
} as Action;
