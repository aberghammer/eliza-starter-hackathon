//import { analyzeData } from "./actions/analyze-data";
import { buyToken } from "./actions/buy-token";
import { checkSell } from "./actions/check-sell";
import { sellToken } from "./actions/sell-token";
import { manualBuy } from "./actions/manual-buy";
import { manualSell } from "./actions/manual-sell";
import { housekeeping } from "./actions/housekeeping";
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
