import {
  elizaLogger,
  type Action,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  type ActionExample,
} from "@elizaos/core";

import { DexscreenerProvider } from "../providers/dexscreener-provider.ts";
import { PROFIT_TARGET, STOP_LOSS } from "../config.ts";
import { TokenMetricsProvider } from "../providers/token-metrics-provider-psql.ts";

export const checkSell: Action = {
  name: "CHECK_SELL",
  similes: ["CHECK", "CHECK SELL", "CHECK PROFITS", "CHECK TRADES"],
  description:
    "Checks if any active trades should be sold based on multiple metrics",

  validate: async (_runtime: IAgentRuntime, _message: Memory) => true,

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<boolean> => {
    try {
      // 🛠️ Debugging Optionen
      const alwaysFlagsForSell = false; // Erzwingt Verkauf für alle Trades
      const printDexScreenerResponse = false; // Debugging der API-Daten

      const dexscreenerProvider = new DexscreenerProvider();
      const tokenMetricsProvider = new TokenMetricsProvider(
        runtime.getSetting("DB_CONNECTION_STRING")
      );

      const activeTrades = await tokenMetricsProvider.getActiveTrades();
      elizaLogger.log(
        `📊 Checking ${activeTrades.length} active trades for sell conditions`
      );

      let markedForSelling = 0;
      let totalPnL = 0;

      for (const trade of activeTrades) {
        try {
          const dexData = await dexscreenerProvider.fetchTokenPrice(
            trade.token_address
          );
          if (printDexScreenerResponse) {
            elizaLogger.log("DexScreener response:", dexData);
          }

          // 📌 WETH-Paar für Preis in ETH finden
          const wethPair = dexData.pairs?.find(
            (p) => p.quoteToken.symbol === "WETH"
          );
          const currentPriceInEth = wethPair?.priceNative
            ? parseFloat(wethPair.priceNative)
            : null;

          const entryPrice = trade.entry_price;
          const symbol = wethPair?.baseToken?.symbol || trade.symbol;

          if (!entryPrice || !currentPriceInEth) {
            elizaLogger.log(`⚠️ Skipping ${symbol} due to missing price data`);
            continue;
          }

          // 📈 Berechnung der Gewinn/Verlust-Rate
          const profitLossPercent =
            ((currentPriceInEth - entryPrice) / entryPrice) * 100;
          totalPnL += profitLossPercent;

          // 📊 Zusätzliche Verkaufsindikatoren abrufen
          const historicalMetrics =
            await tokenMetricsProvider.getLatestTokenMetricsForToken(
              trade.token_address
            );
          if (!historicalMetrics || historicalMetrics.length < 3) {
            elizaLogger.log(
              `⚠️ Not enough historical data for ${symbol}, skipping advanced checks`
            );
            continue;
          }

          const latestMetrics = historicalMetrics[0];
          const volumeDrop =
            ((latestMetrics.volume_24h - trade.volume_24h) / trade.volume_24h) *
            100;
          const isVolumeDropping = volumeDrop < -50;

          const isPriceZScoreBad = latestMetrics.price_momentum < -2.0; // Starke negative Abweichung

          // 📌 Dynamischer Trailing Stop-Loss
          let stopLossLevel = trade.stop_loss_level ?? STOP_LOSS;
          if (profitLossPercent > 20) {
            stopLossLevel = Math.max(stopLossLevel, -10); // Setze neuen Trailing Stop-Loss
          }

          // 📌 Verkaufsbedingungen prüfen
          if (
            profitLossPercent >= PROFIT_TARGET ||
            profitLossPercent <= stopLossLevel ||
            isVolumeDropping ||
            isPriceZScoreBad ||
            alwaysFlagsForSell
          ) {
            elizaLogger.log(
              `🚨 Sell signal for ${symbol}: P/L = ${profitLossPercent}%, Stop Loss = ${stopLossLevel}%, Volume Drop = ${volumeDrop}%`
            );
            markedForSelling++;

            const updatedMetrics = {
              ...trade,
              sell_signal: true,
              stop_loss_level: stopLossLevel, // ✅ Stop-Loss-Level speichern
              exit_price: currentPriceInEth, // Aktueller Preis als Exit-Preis
              profit_loss: profitLossPercent, // Berechneter Gewinn/Verlust
              timestamp: new Date().toISOString(),
              finalized: true,
            };
            await tokenMetricsProvider.upsertTokenMetrics(updatedMetrics);
          }
        } catch (error) {
          elizaLogger.error(
            `❌ Error checking sell for ${trade.symbol}:`,
            error
          );
        }
      }

      elizaLogger.log(
        `✅ Sell check completed. Flagged ${markedForSelling} of ${activeTrades.length} trades for selling`
      );

      if (callback) {
        callback({
          text: `💰 Trade check complete | ${
            activeTrades.length
          } active trades monitored | ${markedForSelling} sell signals | Average P/L: ${
            totalPnL / activeTrades.length || 0
          }%`,
          action: "CHECK_SELL_COMPLETE",
        });
      }

      return true;
    } catch (error) {
      elizaLogger.error("❌ Error in sell check:", error);
      if (callback) {
        callback({
          text: `Failed to check trades: ${error.message}`,
          action: "CHECK_ERROR",
        });
      }
      return false;
    }
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: "Check if we should sell any tokens" },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Checking sell conditions for active trades...",
          action: "CHECK_SELL",
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
