import { elizaLogger, ICacheManager } from "@elizaos/core";

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
      elizaLogger.log("📡 Analyzer started...");

      // check if the twitter config is valid - if not set your ENV variables correctly.
      const twitterConfig: TwitterConfig = await validateTwitterConfig(
        _runtime
      );

      // create a new twitter manager.
      // the twitter manager can now
      // be used to interact with the twitter api.
      // we have some basic stuff like initializing the client
      // and scrapint tweets from a list of accounts.
      const manager = new TwitterManager(_runtime, twitterConfig);
      await manager.client.init();

      const cookieProvider = new CookieApiProvider(_runtime);

      // API-Aufruf für die Top 10 Agents mit dem höchsten Mindshare
      const agentsResponse = await cookieProvider.fetchAgentsPaged(
        "_7Days",
        1,
        10
      );

      if (!agentsResponse?.ok?.data || !Array.isArray(agentsResponse.ok.data)) {
        throw new Error("Invalid response format from fetchAgentsPaged");
      }

      // Extrahiere Twitter-Usernames & sortiere nach Mindshare (absteigend)
      const topTwitterAccounts = agentsResponse.ok.data
        .sort((a, b) => b.mindshare - a.mindshare) // Mindshare absteigend sortieren
        .flatMap((agent) => agent.twitterUsernames) // Extrahiere alle Twitter-Usernames
        .filter(Boolean) // Entferne leere Werte
        .slice(0, 10); // Behalte nur die Top 10

      console.log("📢 Top Twitter Accounts:", topTwitterAccounts);

      // Setze die Top 10 Accounts in `putAccountsIntoChunks()`
      manager.interaction.putAccountsIntoChunks(topTwitterAccounts);

      // We put the tweets into chunks and collect the data
      // from the twitter api.
      // in the end a post is created with the data.
      //   const summary = await manager.interaction.handleTwitterBatch();

      //   const tweet = summary
      //     ? await manager.interaction.createTweet(summary)
      //     : null;

      elizaLogger.log("📡 Analyzer finished...");

      //___________SCHREIBEN DER ERGEBNISSE IN DIE DATENBANK____________________________

      // const db = new BetterSQLite3("data/db.sqlite");
      // // Provider instanziieren
      // const tokenMetricsProvider = new TokenMetricsProvider(db);
      // // Beispiel-Daten
      // const exampleMetrics: TokenMetrics = {
      //   tokenAddress: "0x1234567890abcdef",
      //   symbol: "TEST",
      //   mindshare: 85.5,
      //   sentimentScore: 0.8,
      //   liquidity: 1000000,
      //   priceChange24h: 12.3,
      //   holderDistribution: "Whale-Dominanz: 20%",
      //   timestamp: new Date().toISOString(),
      //   buySignal: true,
      // };
      // // Metriken speichern
      // tokenMetricsProvider.upsertTokenMetrics(exampleMetrics);
      // // Letzte Token-Metriken abrufen
      // const latestMetrics = tokenMetricsProvider.getLatestTokenMetrics();
      // console.log("📊 Letzte Token-Metriken:", latestMetrics);

      //____________________________________________________________________________________

      // Token-Metriken löschen
      // tokenMetricsProvider.removeTokenMetrics("0x1234567890abcdef");

      //TODO:
      //Hier instanziieren wir den CookieFunApiProvider und führen
      //eine Methode aus, die die Daten von Cookie.fun abruft
      //danach rufen wir eine Funktion auf und Metriken zu berechnen.
      //die finalen Metriken geben eine Kaufempfehlung zurück.
      //Bei Kaufempfehlung schreiben wir die Daten in die Datenbank
      //und kaufen den Token. (Dummy)

      //const cookieApiProvider = new CookieApiProvider(...);
      //cookieApiProvider.doSomething();
      //...

      // token wird gekauft wenn die analyse positiv ist und dann wird getwittert
      // const twitterProvider = new TwitterProvider(...);
      // twitterProvider.tweet("I just bought the token");

      _callback({
        text: `🚀 Data sucessfully analyzed`,
        action: "DATA_ANALYZED",
      });

      return true;
    } catch (error) {
      console.error("❌ Error analyzing:", error);
      _callback({
        text: "There was an error: .",
        action: "DATA_ERROR",
      });

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
