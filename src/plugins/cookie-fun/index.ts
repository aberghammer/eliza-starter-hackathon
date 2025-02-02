import { Plugin } from "@elizaos/core";
import { analyzeData } from "./actions/analyze-data.ts";
import { checkSell } from "./actions/check-sell.ts";
import { housekeeping } from "./actions/housekeeping.ts";
import { tweetMindshare } from "./actions/tweet-mindshare.ts";
import { buyToken } from "./actions/buy-token.ts";
import { sellToken } from "./actions/sell-token.ts";

export * as actions from "./actions/index.ts";

export const cookieFun: Plugin = {
  name: "scrapeTelegram",
  description: "Agent checks telegram groups",
  actions: [tweetMindshare, analyzeData, checkSell, housekeeping, buyToken, sellToken],
  evaluators: [],
  providers: [],
};
