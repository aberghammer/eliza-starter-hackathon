import { elizaLogger, ICacheManager, UUID } from "@elizaos/core";
import BetterSQLite3 from "better-sqlite3";

import {
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  type Action,
} from "@elizaos/core";

import { TokenMetricsProvider } from "../providers/token-metrics-provider.ts";

import { CookieApiProvider } from "../providers/cookie-api-provider.ts";
import { DexscreenerProvider } from "../providers/dexscreener-provider.ts";
import { TokenMetrics } from "../types/TokenMetrics.ts";

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

      //-------------------------------Stellschrauben--------------------------------
      const hardcodedTokenToBuy = "0x912ce59144191c1204e64559fe8253a0e49e6548"; // ⚠️⚠️⚠️ Forces a sell simulating a profit taking, instead of waiting to hit the rules (above 30% gains or below 20% loss)
      const hardcodedChain = 42161; // ⚠️⚠️⚠️ Hardcoded arbitrum chain to use for the analysis
      const cleanDatabase = false; // ⚠️⚠️⚠️ Cleans all entries into the database, to delete old mistakes or trades that are in the way
      //-------------------------------Stellschrauben--------------------------------

      const db = new BetterSQLite3("data/db.sqlite");
      const tokenMetricsProvider = new TokenMetricsProvider(db);
      const cookieProvider = new CookieApiProvider(_runtime);
      const dexscreenerProvider = new DexscreenerProvider();

      if (cleanDatabase) {
        tokenMetricsProvider.cleanupAllTokenMetrics(); // ⚠️⚠️⚠️ Clean existing data, so we can keep trading the same token multiple times
        elizaLogger.log("Database cleaned, starting fresh analysis...");
      }

      const response = await cookieProvider.fetchAgentByTwitter("aixbt_agent");

      //___________SCHREIBEN DER ERGEBNISSE IN DIE DATENBANK____________________________

      // Provider instanziieren
      if (!response?.ok) {
        throw new Error("Invalid API response");
      }

      const agent = response.ok;

      // Token-Daten extrahieren (erstes Contract-Token nehmen)
      let tokenAddress =
        agent.contracts.length > 0
          ? agent.contracts[0].contractAddress
          : "UNKNOWN";

      // Daten für die Datenbank formatieren
      tokenAddress = hardcodedTokenToBuy || tokenAddress; // ⚠️⚠️⚠️ Takes hardcodedTokenToBuy if its filled, otherwise just uses the tokenaddress given by the agent
      const tokenMetrics: TokenMetrics = {
        tokenAddress,
        chainId: hardcodedChain || agent.conracts.chain, // ⚠️⚠️⚠️ Takes hardcodedChain if its filled, otherwise just uses the chain given by the agent
        symbol: agent.agentName.toUpperCase(), // Symbol aus AgentName ableiten
        mindshare: agent.mindshare || 0,
        sentimentScore: agent.mindshareDeltaPercent || 0, // Hier könnte eine bessere Sentiment-Berechnung erfolgen
        liquidity: agent.liquidity || 0,
        priceChange24h: agent.priceDeltaPercent || 0,
        holderDistribution: `Holders: ${agent.holdersCount} (Change: ${agent.holdersCountDeltaPercent}%)`,
        timestamp: new Date().toISOString(),
        buySignal: true, // Einfacher Logik-Check, ob Mindshare stark gestiegen ist
        finalized: false,
      };

      let buyPrice = 0;

      const existingTrade = tokenMetricsProvider
        .getActiveTrades()
        .find((t) => t.tokenAddress === tokenMetrics.tokenAddress); //+1 Luigi sloppy: Hack to avoid if loop for testing

      if (!existingTrade) {
        tokenMetricsProvider.upsertTokenMetrics(tokenMetrics); //Luigi sloppy: disable database writing to allow to buy token multiple times for now
        elizaLogger.log(
          `✅ Neuer Trade für ${tokenMetrics.tokenAddress} angelegt.`
        );

        if (tokenMetrics.buySignal) {
          const currentStats = await dexscreenerProvider.fetchTokenPrice(
            tokenAddress
          );
          buyPrice = currentStats.price;
          // Create a buy token memory
          const buyMemory: Memory = {
            id: `${_message.id}-buy` as UUID,
            agentId: _runtime.agentId,
            userId: _message.userId,
            roomId: _message.roomId,
            createdAt: Date.now(),
            content: {
              text: `Buying token ${tokenMetrics.tokenAddress}`,
              action: "BUY_TOKEN",
            },
          };

          // Execute the buy action
          await _runtime.processActions(
            buyMemory,
            [buyMemory],
            _state,
            async (result) => {
              if (result.action === "TOKEN_BOUGHT" && result.data) {
                const tradeData = result.data as {
                  symbol: string;
                  price: number;
                };
                elizaLogger.log("✅ Buy action completed successfully");

                elizaLogger.log(
                  `✅ Trade metrics saved for ${tokenMetrics.symbol} at price ${tokenMetrics.entryPrice}`
                );
              } else if (result.action === "BUY_ERROR") {
                elizaLogger.error("❌ Buy action failed");
              }
              return [];
            }
          );
        }
      } else {
        elizaLogger.log(
          `⚠️ Trade für ${tokenMetrics.tokenAddress} existiert bereits. Kein neuer Eintrag.`
        );
      }
      // Daten in die Datenbank speichern
      // // Metriken speichern

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
