//import { analyzeData } from "./actions/analyze-data";
import { buyToken } from "./actions/buy-token.ts";
import { checkSell } from "./actions/check-sell.ts";
import { sellToken } from "./actions/sell-token.ts";
import { manualBuy } from "./actions/manual-buy.ts";
import { manualSell } from "./actions/manual-sell.ts";
import { housekeeping } from "./actions/housekeeping.ts";
import type { Plugin } from "@elizaos/core";

export default {
  name: "cookie-fun",
  description: "Cookie.fun trading plugin",
  version: "1.0.0",
  actions: [
   // analyzeData,
    buyToken,
    checkSell,
    sellToken,
    manualBuy,
    manualSell,
    housekeeping
  ]
} as Plugin;
