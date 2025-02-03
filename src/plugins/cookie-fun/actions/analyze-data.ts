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
import type { TokenMetrics } from "../types/TokenMetrics.ts";

import { CookieApiProvider } from "../providers/cookie-api-provider.ts";
import { DexscreenerProvider } from "../providers/dexscreener-provider.ts";
import { ACTIVE_CHAIN } from '../config.ts';
import { getChainId } from '../utils/chain-utils.ts';

export const analyzeData: Action = {
  name: "ANALYZE_DATA",
  similes: ["ANALYZE", "GET COOKIE DATA", "DATA ANALYZE"],
  description: "Analyzes market data and sets buy signals in database",

  validate: async (_runtime: IAgentRuntime, _message: Memory) => {
    return true;
  },

  handler: async (runtime: IAgentRuntime): Promise<boolean> => {
    try {
      elizaLogger.log("📊 Starting market analysis...");

      //-------------------------------Stellschrauben--------------------------------
      const hardcodedTokenToBuy = "0x912ce59144191c1204e64559fe8253a0e49e6548"; // Forces analysis of a specific token
      const cleanDatabase = false; // Cleans all entries in the database
      //-------------------------------Stellschrauben--------------------------------
      
      const db = new BetterSQLite3("data/db.sqlite");
      const tokenMetricsProvider = new TokenMetricsProvider(db);
      const cookieProvider = new CookieApiProvider(runtime);
      const dexscreener = new DexscreenerProvider();

      if(cleanDatabase){
        tokenMetricsProvider.cleanupAllTokenMetrics(); // Clean existing data, so we can keep trading the same token multiple times
        elizaLogger.log("Database cleaned, starting fresh analysis...");
      }

      // If we have a hardcoded token, analyze just that one
      if (hardcodedTokenToBuy) {
        const dexData = await dexscreener.fetchTokenPrice(hardcodedTokenToBuy);
        
        const metrics: TokenMetrics = {
          tokenAddress: hardcodedTokenToBuy,
          chainId: getChainId(ACTIVE_CHAIN),
          chainName: ACTIVE_CHAIN,
          symbol: dexData.symbol || "UNKNOWN",
          mindshare: 100, // High mindshare for testing
          sentimentScore: 1, // High sentiment for testing
          liquidity: dexData.liquidity || 0,
          priceChange24h: dexData.priceChange24h || 0,
          holderDistribution: JSON.stringify({
            whales: "10%",      // Large holders (>1% supply)
            medium: "30%",      // Medium holders (0.1-1% supply)
            retail: "60%"       // Small holders (<0.1% supply)
          }),
          timestamp: new Date().toISOString(),
          buySignal: true,                   // Force buy for testing
          sellSignal: false,                 // Initialize
          entryPrice: null,                  // Will be set when bought
          exitPrice: null,                   // Will be set when sold
          profitLoss: null,                    // Will be calculated when sold
          finalized: false
        };

        tokenMetricsProvider.upsertTokenMetrics(metrics);
        elizaLogger.log(`🎯 Buy signal set for hardcoded token ${hardcodedTokenToBuy}`);
      } else {
        // Get data from Cookie API
        const response = await cookieProvider.fetchAgentByTwitter("aixbt_agent");

        if (!response?.ok) {
          throw new Error("Invalid API response");
        }

        const agent = response.ok;

        // Extract token data (take first contract token)
        let tokenAddress = agent.contracts.length > 0 
          ? agent.contracts[0].contractAddress 
          : "UNKNOWN";

        if (tokenAddress === "UNKNOWN") {
          throw new Error("No valid token address found");
        }

        // Get additional data from Dexscreener
        const dexData = await dexscreener.fetchTokenPrice(tokenAddress);
        
        const metrics: TokenMetrics = {
          tokenAddress,
          chainId: getChainId(ACTIVE_CHAIN),
          chainName: ACTIVE_CHAIN,
          symbol: agent.agentName.toUpperCase(),
          mindshare: agent.mindshare || 0,
          sentimentScore: agent.sentiment || 0,
          liquidity: dexData.liquidity || 0,
          priceChange24h: dexData.priceChange24h || 0,
          holderDistribution: "",
          timestamp: new Date().toISOString(),
          buySignal: analyzeBuySignal(agent, dexData),
          sellSignal: false,
          entryPrice: null,
          exitPrice: null,
          profitLoss: null,
          finalized: false
        };

        tokenMetricsProvider.upsertTokenMetrics(metrics);
        
        if (metrics.buySignal) {
          elizaLogger.log(`🎯 Buy signal detected for ${metrics.symbol}`);
        }
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

function analyzeBuySignal(agent: any, dexData: any): boolean {
  // Implement your buy signal logic here
  // Example:
  return (agent.mindshare || 0) > 80 && 
         (agent.sentiment || 0) > 0.7 && 
         (dexData.liquidity || 0) > 100000;
}