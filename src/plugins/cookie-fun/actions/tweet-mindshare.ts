import { elizaLogger, ICacheManager, stringToUuid } from "@elizaos/core";
import BetterSQLite3 from "better-sqlite3";

import {
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  type Action,
} from "@elizaos/core";

import { TwitterConfig } from "../providers/twitter-provider/index.ts";

import { TwitterManager } from "../providers/twitter-provider/twitter-base-provider.ts";

import { validateTwitterConfig } from "../providers/twitter-provider/environment.ts";
import { CookieApiProvider } from "../providers/cookie-api-provider.ts";

import { TokenMetricsProvider } from "../providers/token-metrics-provider.ts";
import type { TokenMetrics } from "../types/TokenMetrics.ts";

export const tweetMindshare: Action = {
  name: "TWEET_MINDSHARE",
  similes: [
    "TWEET ACTION",
    "tweetmindshare",
    "POST SOME TWEETS",
    "POST MINDSHARE TWITTER",
  ],
  description: "Getting Data from Cookie.fun and tweeting current mindshare",

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
      elizaLogger.log("📡 Starting the analyzer...");

      const db = new BetterSQLite3("data/db.sqlite");
      const tokenMetricsProvider = new TokenMetricsProvider(db);
      const cookieProvider = new CookieApiProvider(_runtime);

      // Initialize the Twitter manager
      const twitterConfig: TwitterConfig = await validateTwitterConfig(
        _runtime
      );
      const manager = new TwitterManager(_runtime, twitterConfig);
      await manager.client.init();

      let selectedAgentAddress: string | null = null;

      // 🔹 1️⃣ Check for active trades
      const openTrades = tokenMetricsProvider.getActiveTrades();
      elizaLogger.log(`📊 Found ${openTrades.length} active trades`);

      if (openTrades.length > 0) {
        // ✅ If active trades exist, randomly select one
        const trade =
          openTrades.length > 1
            ? openTrades[Math.floor(Math.random() * openTrades.length)]
            : openTrades[0];

        selectedAgentAddress = trade.tokenAddress;
        elizaLogger.log("🎯 Selected trade:", selectedAgentAddress);
      } else {
        // ⚠️ No active trades found → Select a random agent from the API
        elizaLogger.log(
          "⚠️ No active trades found, selecting a random agent..."
        );

        const agentResponse = await cookieProvider.fetchAgentsPaged(
          "_7Days",
          1,
          10
        );

        if (
          !agentResponse.ok ||
          !Array.isArray(agentResponse.ok.data) ||
          agentResponse.ok.data.length === 0
        ) {
          elizaLogger.error("❌ No valid agent found!");
          _callback({ text: "No agents found.", action: "DATA_ERROR" });
          return false;
        }

        // ✅ Select a random agent from the fetched list
        const randomAgent =
          agentResponse.ok.data[
            Math.floor(Math.random() * agentResponse.ok.data.length)
          ];

        // Extract contract address
        selectedAgentAddress =
          randomAgent.contracts[0]?.contractAddress ?? null;

        if (!selectedAgentAddress) {
          elizaLogger.error(
            "❌ No valid contract address found for the agent!"
          );
          _callback({
            text: "No valid agent contract found.",
            action: "DATA_ERROR",
          });
          return false;
        }

        elizaLogger.log("🎯 Selected random agent:", selectedAgentAddress);
      }

      // 🔹 2️⃣ Fetch top tweets for the selected agent or trade
      elizaLogger.log("📡 Fetching top tweets for:", selectedAgentAddress);

      const agentTweets = await cookieProvider.fetchAgentByContract(
        selectedAgentAddress
      );

      if (
        !agentTweets.ok ||
        !agentTweets.ok.topTweets ||
        agentTweets.ok.topTweets.length === 0
      ) {
        elizaLogger.error("❌ No tweets found for the selected agent.");
        _callback({
          text: "No tweets found for the agent.",
          action: "DATA_ERROR",
        });
        return false;
      }

      // Extract tweet IDs from URLs
      const tweetUrls = agentTweets.ok.topTweets.map((tweet) => tweet.tweetUrl);
      const tweetIds = tweetUrls.map((url) => url.split("/status/")[1]);

      elizaLogger.log("📡 Extracted Tweet IDs:", tweetIds);

      // 🔹 3️⃣ Fetch tweet contents
      elizaLogger.log("📡 Fetching tweet contents...");
      const tweetContents = await manager.interaction.fetchTweetsById(tweetIds);

      if (!tweetContents || tweetContents.length === 0) {
        elizaLogger.error("❌ No tweet contents found.");
        _callback({ text: "No tweet contents found.", action: "DATA_ERROR" });
        return false;
      }

      elizaLogger.log(
        "✅ Successfully fetched tweet contents:",
        tweetContents.length
      );

      // 🔹 4️⃣ Generate and post the tweet
      elizaLogger.log("📡 Generating and posting the final tweet...");
      await manager.interaction.generateAndPostTweet(
        tweetContents,
        _state.roomId
      );

      elizaLogger.log("✅ Successfully completed tweet posting!");

      _callback({
        text: `🚀 Data successfully analyzed and tweeted.`,
        action: "DATA_ANALYZED",
      });

      return true;
    } catch (error) {
      console.error("❌ Error analyzing:", error);
      _callback({ text: "There was an error.", action: "DATA_ERROR" });
      return false;
    }
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Can you analyze the latest trades and tweet about them?",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "📡 Fetching the latest active trades... Please wait.",
          action: "DATA_ANALYZED",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "✅ Found an open trade. Fetching relevant tweets...",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "🚀 Successfully posted a tweet with the latest trading insights!",
          action: "POST_TWEET",
        },
      },
    ],
    [
      {
        user: "{{user2}}",
        content: {
          text: "Check Cookie.fun and tweet about a trending project.",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "🔍 No open trades found. Selecting a random agent...",
          action: "DATA_ANALYZED",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "🎯 Found a trending agent. Extracting top tweets...",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "✅ Generating a tweet summary with relevant market insights.",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "📢 Tweet posted successfully! Check it out on Twitter.",
          action: "POST_TWEET",
        },
      },
    ],
    [
      {
        user: "{{user3}}",
        content: {
          text: "Are there any tweets about my favorite project?",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "🤖 Searching for tweets related to the project...",
          action: "SEARCH_TWEETS",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "✅ Found several recent tweets. Summarizing them...",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "🚀 Here's a key insight: '$TOKEN is gaining momentum with a 25% increase in smart holders.'",
          action: "ANALYZE_DATA",
        },
      },
    ],
    [
      {
        user: "{{user4}}",
        content: {
          text: "Summarize and tweet about the latest DeFi trends.",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "📡 Fetching DeFi-related data from Cookie.fun...",
          action: "FETCH_DATA",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "✅ Extracted top tweets from industry experts. Generating a tweet...",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "🔥 'DeFi TVL is up 18%! New protocols are reshaping the market. Stay ahead with these insights.'",
          action: "POST_TWEET",
        },
      },
    ],
    [
      {
        user: "{{user5}}",
        content: {
          text: "What's trending in crypto today?",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "📊 Analyzing trending tokens and top Twitter discussions...",
          action: "FETCH_DATA",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "✅ Found a trending topic: '$TOKEN is making waves with record-breaking volume!'",
        },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "🚀 Posting an update about the hottest market trends!",
          action: "POST_TWEET",
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
