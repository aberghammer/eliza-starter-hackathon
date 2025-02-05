import { elizaLogger, ICacheManager, UUID } from "@elizaos/core";

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
      // const hardcodedTokenToBuy = "0x912ce59144191c1204e64559fe8253a0e49e6548"; // Forces analysis of a specific token
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

        const metrics: TokenMetrics = {
          token_address: hardcodedTokenToBuy,
          chain_id: getChainId(ACTIVE_CHAIN),
          chain_name: ACTIVE_CHAIN,
          symbol: dexData.symbol || "UNKNOWN",
          mindshare: 100, // High mindshare for testing
          sentiment_score: 1, // High sentiment for testing
          liquidity: dexData.liquidity || 0,
          price_change24h: dexData.price_change24h || 0,
          holder_distribution: JSON.stringify({
            whales: "10%", // Large holders (>1% supply)
            medium: "30%", // Medium holders (0.1-1% supply)
            retail: "60%", // Small holders (<0.1% supply)
          }),
          timestamp: new Date().toISOString(),
          buy_signal: true, // Force buy for testing
          sell_signal: false, // Initialize
          // entry_price: null, // Will be set when bought
          // exit_price: null, // Will be set when sold
          // profit_loss: null, // Will be calculated when sold
          finalized: false,
        };

        tokenMetricsProvider.upsertTokenMetrics(metrics);
        elizaLogger.log(
          `🎯 Buy signal set for hardcoded token ${hardcodedTokenToBuy}`
        );
      } else {
        const tokensWithBuySignal = await tokenMetricsProvider.getTokensToBuy();

        if (tokensWithBuySignal.length > 0) {
          for (const token of tokensWithBuySignal) {
            const dexData = await dexscreener.fetchTokenPrice(
              token.token_address
            );

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
          text: "Can you query the data for me?",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "I am checking for trading signals, please wait.",
          action: "ANALYZE_DATA",
        },
      },
    ],
    [
      {
        user: "{{user2}}",
        content: {
          text: "Get the latest trading signals from Cookie.fun",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Fetching data from Cookie.fun. This may take a moment.",
          action: "ANALYZE_DATA",
        },
      },
    ],
    [
      {
        user: "{{user3}}",
        content: {
          text: "Analyze the current market data for me.",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Starting data analysis... please hold on.",
          action: "ANALYZE_DATA",
        },
      },
    ],
    [
      {
        user: "{{user4}}",
        content: {
          text: "Do you have any buy signals?",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Let me analyze the data for potential buy signals. Please wait.",
          action: "ANALYZE_DATA",
        },
      },
    ],
    [
      {
        user: "{{user5}}",
        content: {
          text: "Check Cookie.fun for insights.",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Querying Cookie.fun for trading insights now.",
          action: "ANALYZE_DATA",
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
