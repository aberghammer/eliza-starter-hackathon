import { elizaLogger } from "@elizaos/core";
import {
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  type Action,
} from "@elizaos/core";

import { TokenMetricsProvider } from "../providers/token-metrics-provider-psql.ts";

export const openPositions: Action = {
  name: "OPEN_POSITIONS",
  similes: ["OPEN POSITIONS", "SHOW OPEN POSITIONS", "LIST OPEN POSITIONS"],
  description: "Returns the open positions (active trades) from the database.",

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
      elizaLogger.log("📊 Fetching open positions...");

      const dbConn = runtime.getSetting("DB_CONNECTION_STRING");
      const tokenMetricsProvider = new TokenMetricsProvider(dbConn);

      // Alle offenen Positionen abrufen
      const openTrades = await tokenMetricsProvider.getActiveTrades();
      elizaLogger.log(`✅ Found ${openTrades.length} open position(s).`);

      // Formatierung für Telegram (Markdown)
      const formattedMessage = openTrades
        .map((trade) => {
          return `*Token:* ${trade.symbol}
*Address:* ${trade.token_address}
*Chain:* ${trade.chain_name}
*Entry Price:* ${trade.entry_price !== null ? trade.entry_price : "n/a"}
*Current Price:* ${trade.price}
*Profit/Loss:* ${
            trade.profit_loss !== null
              ? trade.profit_loss.toFixed(2) + "%"
              : "n/a"
          }
*Timestamp:* ${new Date(trade.timestamp).toLocaleString()}
——————————————`;
        })
        .join("\n");

      // Inline-Keyboard: Für jede offene Position ein "Sell"-Button
      const inlineKeyboard = openTrades.map((trade) => [
        {
          text: `Sell ${trade.symbol}`,
          callback_data: `MANUAL_SALE:${trade.token_address}`,
        },
      ]);

      // Callback-Antwort an Telegram mit dem formatierten Text und Inline-Keyboard
      if (callback) {
        callback({
          text: formattedMessage || "Keine offenen Positionen gefunden.",
          action: "OPEN_POSITIONS_COMPLETE",
          reply_markup: {
            inline_keyboard: inlineKeyboard,
          },
        });
      }
      return true;
    } catch (error) {
      elizaLogger.error("❌ Error fetching open positions:", error);
      return false;
    }
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: "What open positions do I have?" },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Fetching open positions from the database...",
          action: "OPEN_POSITIONS",
        },
      },
    ],
    [
      {
        user: "{{user2}}",
        content: { text: "List my open trades." },
      },
      {
        user: "{{eliza}}",
        content: {
          text: "Retrieving your current open positions.",
          action: "OPEN_POSITIONS",
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
