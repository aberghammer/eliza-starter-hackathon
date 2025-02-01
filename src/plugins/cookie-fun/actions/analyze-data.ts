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

import { CookieApiProvider } from "../providers/cookie-api-provider.ts";
import { DexscreenerProvider } from "../providers/dexscreener-provider.ts";

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

      elizaLogger.log("📡 TODO: NOTHING IMPLEMENTED,YET...");

      const db = new BetterSQLite3("data/db.sqlite");
      const tokenMetricsProvider = new TokenMetricsProvider(db);
      const cookieProvider = new CookieApiProvider(_runtime);
      const dexscreenerProvider = new DexscreenerProvider();

      const response = await cookieProvider.fetchAgentByTwitter("aixbt_agent");

      //___________SCHREIBEN DER ERGEBNISSE IN DIE DATENBANK____________________________

      // Provider instanziieren
      if (!response?.ok) {
        throw new Error("Invalid API response");
      }

      const agent = response.ok;

      // Token-Daten extrahieren (erstes Contract-Token nehmen)
      const tokenAddress =
        agent.contracts.length > 0
          ? agent.contracts[0].contractAddress
          : "UNKNOWN";

      // Daten für die Datenbank formatieren
      const tokenMetrics: TokenMetrics = {
        tokenAddress,
        symbol: agent.agentName.toUpperCase(), // Symbol aus AgentName ableiten
        mindshare: agent.mindshare || 0,
        sentimentScore: agent.mindshareDeltaPercent || 0, // Hier könnte eine bessere Sentiment-Berechnung erfolgen
        liquidity: agent.liquidity || 0,
        priceChange24h: agent.priceDeltaPercent || 0,
        holderDistribution: `Holders: ${agent.holdersCount} (Change: ${agent.holdersCountDeltaPercent}%)`,
        timestamp: new Date().toISOString(),
        buySignal: agent.mindshareDeltaPercent > 10, // Einfacher Logik-Check, ob Mindshare stark gestiegen ist
      };

      let buyPrice = 0;

      const existingTrade = tokenMetricsProvider
        .getActiveTrades()
        .find((t) => t.tokenAddress === tokenMetrics.tokenAddress);

      if (!existingTrade) {
        tokenMetricsProvider.insertTokenMetrics(tokenMetrics);
        elizaLogger.log(
          `✅ Neuer Trade für ${tokenMetrics.tokenAddress} angelegt.`
        );

        if (tokenMetrics.buySignal) {
          // Token kaufen
          const currentStats = await dexscreenerProvider.fetchTokenPrice(
            tokenAddress
          );
          elizaLogger.log("🚀 Token gekauft:", currentStats.price);
          buyPrice = currentStats.price;
          //TODO: send tweet
        }
      } else {
        elizaLogger.log(
          `⚠️ Trade für ${tokenMetrics.tokenAddress} existiert bereits. Kein neuer Eintrag.`
        );
      }
      // Daten in die Datenbank speichern
      // // Metriken speichern

      tokenMetrics.entryPrice = buyPrice;
      // // Letzte Token-Metriken abrufen
      tokenMetricsProvider.upsertTokenMetrics(tokenMetrics);

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

      elizaLogger.log("📡 Analyzer finished...");

      _callback({
        text: `🚀 Data sucessfully analyzed`,
        action: "TWEET_MINDSHARE",
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
