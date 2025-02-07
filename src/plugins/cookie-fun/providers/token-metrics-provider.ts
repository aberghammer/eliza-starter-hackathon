// import { PostgresDatabaseAdapter } from "@elizaos/adapter-postgres";
// import { elizaLogger } from "@elizaos/core";
// import type { TokenMetrics } from "../types/TokenMetrics.ts";

// export class TokenMetricsProvider {
//   private db: PostgresDatabaseAdapter;

//   constructor(connectionString: string) {
//     this.db = new PostgresDatabaseAdapter({
//       connectionString,
//       max: 20, // Maximale Anzahl gleichzeitiger Verbindungen
//       idleTimeoutMillis: 30000, // Timeout für inaktive Verbindungen
//       connectionTimeoutMillis: 2000, // Verbindungstimeout
//     });

//     this.initializeDatabase();
//   }

//   private async initializeDatabase() {
//     const query = `
//       CREATE TABLE IF NOT EXISTS token_metrics (
//         id SERIAL PRIMARY KEY,
//         token_address TEXT NOT NULL,
//         chain_id INTEGER NOT NULL,
//         chain_name TEXT NOT NULL,
//         symbol TEXT NOT NULL,
//         mindshare REAL DEFAULT 0,
//         sentiment_score REAL DEFAULT 0,
//         liquidity REAL DEFAULT 0,
//         price_change24h REAL DEFAULT 0,
//         holder_distribution TEXT,
//         timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
//         buy_signal BOOLEAN DEFAULT FALSE,
//         sell_signal BOOLEAN DEFAULT FALSE,
//         entry_price REAL,
//         exit_price REAL,
//         profit_loss REAL,
//         finalized BOOLEAN DEFAULT FALSE,
//         UNIQUE (token_address, chain_id, timestamp)
//       );
//     `;
//     await this.db.query(query);
//   }

//   async getTokensToSell(): Promise<TokenMetrics[]> {
//     const result = await this.db.query(
//       `SELECT * FROM token_metrics WHERE sell_signal = TRUE AND finalized = FALSE`
//     );
//     return result.rows; // ✅ Nur die Daten zurückgeben
//   }

//   async getTokensToBuy(): Promise<TokenMetrics[]> {
//     const result = await this.db.query(
//       `SELECT * FROM token_metrics 
//        WHERE buy_signal = TRUE 
//        AND finalized = FALSE
//        ORDER BY timestamp DESC
//        LIMIT 1`
//     );
//     return result.rows;
//   }

//   async getActiveTrades(): Promise<TokenMetrics[]> {
//     const result = await this.db.query(
//       `SELECT * FROM token_metrics WHERE entry_price IS NOT NULL AND finalized = FALSE`
//     );
//     return result.rows;
//   }

//   async getLatestTokenMetrics(count = 5): Promise<TokenMetrics[]> {
//     const result = await this.db.query(
//       `SELECT * FROM token_metrics ORDER BY timestamp DESC LIMIT $1`,
//       [count]
//     );
//     return result.rows;
//   }

//   async flagForSelling(token_address: string, chain_id: number) {
//     await this.db.query(
//       `UPDATE token_metrics SET sell_signal = TRUE WHERE token_address = $1 AND chain_id = $2`,
//       [token_address, chain_id]
//     );
//   }

//   async finalizeTrade(
//     token_address: string,
//     chain_id: number,
//     exit_price: number,
//     profit_loss: number
//   ) {
//     await this.db.query(
//       `UPDATE token_metrics SET finalized = TRUE, exit_price = $1, profit_loss = $2 WHERE token_address = $3 AND chain_id = $4`,
//       [exit_price, profit_loss, token_address, chain_id]
//     );
//   }

//   async upsertTokenMetrics(metrics: TokenMetrics): Promise<boolean> {
//     const query = `
//       INSERT INTO token_metrics (
//         token_address, chain_id, chain_name, symbol, mindshare, sentiment_score,
//         liquidity, price_change24h, holder_distribution, timestamp,
//         buy_signal, sell_signal, entry_price, exit_price, profit_loss, finalized
//       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
//       ON CONFLICT(token_address, chain_id, timestamp) DO UPDATE SET
//         chain_name = EXCLUDED.chain_name,
//         symbol = EXCLUDED.symbol,
//         mindshare = EXCLUDED.mindshare,
//         sentiment_score = EXCLUDED.sentiment_score,
//         liquidity = EXCLUDED.liquidity,
//         price_change24h = EXCLUDED.price_change24h,
//         holder_distribution = EXCLUDED.holder_distribution,
//         timestamp = EXCLUDED.timestamp,
//         buy_signal = EXCLUDED.buy_signal,
//         sell_signal = EXCLUDED.sell_signal,
//         entry_price = EXCLUDED.entry_price,
//         exit_price = EXCLUDED.exit_price,
//         profit_loss = EXCLUDED.profit_loss,
//         finalized = EXCLUDED.finalized;
//     `;

//     try {
//       await this.db.query(query, [
//         metrics.token_address,
//         metrics.chain_id,
//         metrics.chain_name,
//         metrics.symbol,
//         metrics.mindshare,
//         metrics.sentiment_score,
//         metrics.liquidity,
//         metrics.price_change24h,
//         metrics.holder_distribution ?? "",
//         metrics.timestamp,
//         metrics.buy_signal,
//         metrics.sell_signal,
//         metrics.entry_price ?? null,
//         metrics.exit_price ?? null,
//         metrics.profit_loss ?? null,
//         metrics.finalized,
//       ]);

//       elizaLogger.info(
//         `✅ TokenMetrics für ${metrics.token_address} gespeichert.`
//       );
//       return true;
//     } catch (error) {
//       elizaLogger.error("❌ Fehler beim Speichern der Token-Metriken:", error);
//       return false;
//     }
//   }

//   async updateExitPrice(
//     token_address: string,
//     exit_price: number,
//     profit_loss: number
//   ): Promise<void> {
//     await this.db.query(
//       `UPDATE token_metrics SET exit_price = $1, profit_loss = $2 WHERE token_address = $3 AND exit_price IS NULL`,
//       [exit_price, profit_loss, token_address]
//     );
//   }

//   async removeTokenMetrics(token_address: string): Promise<boolean> {
//     try {
//       await this.db.query(
//         `DELETE FROM token_metrics WHERE token_address = $1`,
//         [token_address]
//       );
//       elizaLogger.info(`🗑 Token-Metriken für ${token_address} gelöscht.`);
//       return true;
//     } catch (error) {
//       elizaLogger.error("❌ Fehler beim Löschen der Token-Metriken:", error);
//       return false;
//     }
//   }

//   async cleanupAllTokenMetrics(): Promise<void> {
//     try {
//       await this.db.query(`DELETE FROM token_metrics`);
//       elizaLogger.info("🧹 Alle Token-Metriken wurden gelöscht.");
//     } catch (error) {
//       elizaLogger.error("❌ Fehler beim Bereinigen der Token-Metriken:", error);
//     }
//   }

//   async close() {
//     await this.db.close();
//   }
// }
