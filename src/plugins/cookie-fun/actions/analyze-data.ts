import { elizaLogger, ICacheManager } from "@elizaos/core";
import BetterSQLite3 from "better-sqlite3";

import {
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  type Action,
} from "@elizaos/core";
import {
  TokenMetrics,
  TokenMetricsProvider,
} from "../providers/token-metrics-provider.ts";

export const analyzeData: Action = {
  name: "ANALYZE_DATA",
  similes: ["ANALYZE", "GET COOKIE DATA", "DATA ANALYZE ACTION"],
  description: "Getting Data from Cookie.fun.",

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

      const db = new BetterSQLite3("data/db.sqlite");

      // Provider instanziieren
      const tokenMetricsProvider = new TokenMetricsProvider(db);

      // Beispiel-Daten
      const exampleMetrics: TokenMetrics = {
        tokenAddress: "0x1234567890abcdef",
        symbol: "TEST",
        mindshare: 85.5,
        sentimentScore: 0.8,
        liquidity: 1000000,
        priceChange24h: 12.3,
        holderDistribution: "Whale-Dominanz: 20%",
        timestamp: new Date().toISOString(),
        buySignal: true,
      };

      // Metriken speichern
      tokenMetricsProvider.upsertTokenMetrics(exampleMetrics);

      // Letzte Token-Metriken abrufen
      const latestMetrics = tokenMetricsProvider.getLatestTokenMetrics();
      console.log("📊 Letzte Token-Metriken:", latestMetrics);

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
