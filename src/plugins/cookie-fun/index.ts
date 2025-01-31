import { Plugin } from "@elizaos/core";
import { analyzeData } from "./actions/analyze-data.ts";
import { checkSell } from "./actions/check-sell.ts";
import { housekeeping } from "./actions/housekeeping.ts";

export * as actions from "./actions/index.ts";

export const cookieFun: Plugin = {
  name: "scrapeTelegram",
  description: "Agent checks telegram groups",
  actions: [analyzeData, checkSell, housekeeping],
  evaluators: [],
  providers: [],
};
