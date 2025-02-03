import { 
  elizaLogger, 
  type Action, 
  type IAgentRuntime, 
  type Memory,
  type State,
  type HandlerCallback 
} from "@elizaos/core";
import { HousekeepingService } from "../services/housekeeping.ts";

export const housekeeping: Action = {
  name: "HOUSEKEEPING",
  similes: ["HOUSEKEEPING", "MAINTENANCE", "RUN TASKS"],
  description: "Run automated trading tasks",

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
    const service = new HousekeepingService();
    return service.runCycle(_runtime, _callback);
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Run housekeeping tasks",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Running automated trading tasks",
          action: "HOUSEKEEPING",
        },
      },
    ],
  ],
} as Action;
