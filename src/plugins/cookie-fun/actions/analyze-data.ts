import { elizaLogger } from "@elizaos/core";

import {
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  type Action,
} from "@elizaos/core";

import type { TokenMetrics } from "../types/TokenMetrics.ts";

import { CookieApiProvider } from "../providers/cookie-api-provider.ts";
import { DexscreenerProvider } from "../providers/dexscreener-provider.ts";
import { ACTIVE_CHAIN } from "../config.ts";
import { getChainId } from "../utils/chain-utils.ts";
import { TokenMetricsProvider } from "../providers/token-metrics-provider-psql.ts";
import {
  TwitterConfig,
  TwitterManager,
  validateTwitterConfig,
} from "../providers/index.ts";

export const analyzeData: Action = {
  name: "ANALYZE_DATA",
  similes: [
    //    "ANALYZE THE DATA",
    "ANALYZE DATA",
    //    "RUN ANALYSIS",
    //  "MARKET ANALYSIS",
    //   "SCAN MARKET",
    //   "CHECK MARKET"
  ],
  description: "Analyzes market data and sets buy signals in database",

  validate: async (_runtime: IAgentRuntime, _message: Memory) => {
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<boolean> => {
    try {
      elizaLogger.log("📊 Starting market analysis...");

      //-------------------------------Stellschrauben--------------------------------
      //const hardcodedTokenToBuy = "0xba5a56756f9526565410c4614E14a1C9De8248ba"; // Forces analysis of a specific token
      const hardcodedTokenToBuy = ""; // Forces analysis of a specific token
      const cleanDatabase = false; // Cleans all entries in the database
      //-------------------------------Stellschrauben--------------------------------

      const tokenMetricsProvider = new TokenMetricsProvider(
        runtime.getSetting("DB_CONNECTION_STRING")
      );

      const dexscreener = new DexscreenerProvider();

      if (cleanDatabase) {
        tokenMetricsProvider.cleanupAllTokenMetrics(); // Clean existing data, so we can keep trading the same token multiple times
        elizaLogger.log("Database cleaned, starting fresh analysis...");
      }

      // If we have a hardcoded token, analyze just that one
      if (hardcodedTokenToBuy) {
        const dexData = await dexscreener.fetchTokenPrice(hardcodedTokenToBuy);

        // Use "ZERA" as fallback symbol if dexscreener fails
        const tokenSymbol = dexData && dexData.symbol ? dexData.symbol : "ZERA";

        const metrics: TokenMetrics = {
          token_address: hardcodedTokenToBuy,
          chain_id: getChainId(ACTIVE_CHAIN),
          chain_name: ACTIVE_CHAIN,
          symbol: tokenSymbol, // Use our fallback symbol
          mindshare: 100,
          liquidity: dexData.liquidity || 0,
          volume_24h: dexData.volume_24h || 0,
          holders_count: dexData.holders_count || 0,
          volume_momentum: 0,
          mindshare_momentum: 0,
          timestamp: new Date().toISOString(),
          buy_signal: true,
          sell_signal: false,
          price_momentum: 0,
          total_score: 0,
          liquidity_momentum: 0,
          holders_momentum: 0,
          finalized: false,
          price: dexData.price || 0,
        };

        await tokenMetricsProvider.upsertTokenMetrics(metrics);
        elizaLogger.log(
          `🎯 Buy signal set for hardcoded token ${hardcodedTokenToBuy} (${tokenSymbol})`
        );
      } else {
        const tokensWithBuySignal = await tokenMetricsProvider.getTokensToBuy();

        if (tokensWithBuySignal.length > 0) {
          for (const token of tokensWithBuySignal) {
            // const dexData = await dexscreener.fetchTokenPrice(
            //   token.token_address
            // );

            const cookieProvider = new CookieApiProvider(runtime);
            const twitterConfig: TwitterConfig = await validateTwitterConfig(
              runtime
            );
            const manager = new TwitterManager(runtime, twitterConfig);
            await manager.client.init();
            // Get data from Cookie API

            const today = new Date().toISOString().split("T")[0];
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const formattedYesterday = yesterday.toISOString().split("T")[0];

            elizaLogger.log("Token properties:", token);

            const data = await cookieProvider.searchTweets(
              token.symbol,
              formattedYesterday,
              today
            );

            const tweets = data.ok;
            if (tweets.length === 0) {
              elizaLogger.log(
                `⚠️ No tweets found for ${token.symbol} in given date range.`
              );
              return false;
            }

            elizaLogger.log(`📊 Found ${tweets.length} tweets for analysis`);

            // Sentiment-Analyse durchführen
            const decision = await manager.interaction.analyzeSentiment(
              token.symbol,
              tweets
            );

            if (decision) {
              elizaLogger.log(`🎯 Buy signal detected for ${token.symbol}`);
            }
            // token.buy_signal = decision;
            tokenMetricsProvider.upsertTokenMetrics(token);
          }
        }
      }

      if (callback) {
        const buySignals = await tokenMetricsProvider.getTokensToBuy();
        callback({
          text: `📊 Analysis complete | Found ${buySignals.length} potential buy opportunities | Mindshare and sentiment analyzed | Liquidity verified`,
          action: "ANALYZE_DATA_COMPLETE",
        });
      }

      elizaLogger.log("✅ Market analysis completed");
      return true;
    } catch (error) {
      elizaLogger.error("❌ Error in market analysis:", error);
      return false;
    }
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Can you check if there are any buy signals in our system?",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "I'm checking the database for active buy recommendations. Please wait...",
          action: "ANALYZE_DATA",
        },
      },
    ],
    [
      {
        user: "{{user2}}",
        content: {
          text: "Show me the current trading recommendations.",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Fetching active buy signals from our records...",
          action: "ANALYZE_DATA",
        },
      },
    ],
    [
      {
        user: "{{user3}}",
        content: {
          text: "Do we have any new buy signals?",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Let me check our database for fresh trading signals.",
          action: "ANALYZE_DATA",
        },
      },
    ],
    [
      {
        user: "{{user4}}",
        content: {
          text: "Retrieve the latest buy recommendations.",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "I am querying our trading signals. Please hold on...",
          action: "ANALYZE_DATA",
        },
      },
    ],
    [
      {
        user: "{{user5}}",
        content: {
          text: "What buy signals do we have at the moment?",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "I'm pulling the current buy recommendations from the system.",
          action: "ANALYZE_DATA",
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
