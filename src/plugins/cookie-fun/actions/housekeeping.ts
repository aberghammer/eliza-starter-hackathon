import {
  elizaLogger,
  type Action,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
} from "@elizaos/core";
import { HousekeepingService } from "../services/housekeeping.ts";
import { HOUSEKEEPING_MINUTES } from "../config.ts";

export const housekeeping: Action = {
  name: "HOUSEKEEPING",
  similes: [
    "HOUSEKEEPING",
    //  "MAINTENANCE",
    //  "RUN TASKS",
    //  "START HOUSEKEEPING",
    //  "AUTOMATIC"
  ],
  description:
    "Run automated trading tasks. Use 'loop' parameter to run continuously",

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
      const service = new HousekeepingService(_runtime);

      /* // Initial callback with mode info
      _callback?.({
        text: "🔄 Starting housekeeping tasks...",
        action: "HOUSEKEEPING_START",
        data: {
          mode: _message.content.text?.toLowerCase().includes('loop') ? 'continuous' : 'single',
          startTime: new Date().toISOString()
        }
      });*/

      const result = await service.runCycle(_runtime, _callback);

      // Check if loop parameter was passed
      const shouldLoop = (_message.content as any).text
        ?.toLowerCase()
        .includes("loop");

      if (result && shouldLoop && !global.housekeepingInterval) {
        global.housekeepingInterval = setInterval(
          () => service.runCycle(_runtime, _callback),
          HOUSEKEEPING_MINUTES * 60 * 1000
        );

        // Scheduling message only for loop mode
        _callback?.({
          text: `✅ Housekeeping scheduled | Interval: ${HOUSEKEEPING_MINUTES}min | Next run: ${new Date(
            Date.now() + HOUSEKEEPING_MINUTES * 60 * 1000
          ).toLocaleTimeString()}`,
          action: "HOUSEKEEPING_SCHEDULED",
          data: {
            intervalMinutes: HOUSEKEEPING_MINUTES,
            nextRun: new Date(
              Date.now() + HOUSEKEEPING_MINUTES * 60 * 1000
            ).toISOString(),
          },
        });
      } else if (result) {
        // Single run completion message
        _callback?.({
          text: `✅ Housekeeping cycle complete | Tasks executed: Market analysis, Buy orders, Sell checks | Duration: ${
            Date.now() - new Date(_message.createdAt).getTime()
          }ms`,
          action: "HOUSEKEEPING_COMPLETE",
          data: {
            duration: Date.now() - new Date(_message.createdAt).getTime(),
            mode: "single",
          },
        });
      }

      return result;
    } catch (error) {
      // Enhanced error callback
      _callback?.({
        text: `❌ Housekeeping error: ${error.message}`,
        action: "HOUSEKEEPING_ERROR",
        data: {
          error: error.message,
          timestamp: new Date().toISOString(),
        },
      });
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
