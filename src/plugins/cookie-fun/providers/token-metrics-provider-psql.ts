import { PostgresDatabaseAdapter } from "@elizaos/adapter-postgres";
import type { TokenMetrics } from "../types/TokenMetrics.ts";

export class TokenMetricsProvider {
  private db: PostgresDatabaseAdapter;

  constructor(connectionString: string) {
    this.db = new PostgresDatabaseAdapter({
      connectionString,
      max: 20, // Maximale Anzahl gleichzeitiger Verbindungen
      idleTimeoutMillis: 30000, // Timeout für inaktive Verbindungen
      connectionTimeoutMillis: 2000, // Verbindungstimeout
    });

    this.initializeDatabase();
  }
  private async initializeDatabase() {
    const query = `
      CREATE TABLE IF NOT EXISTS token_metrics (
        id SERIAL PRIMARY KEY,
        token_address TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        chain_name TEXT NOT NULL,
        symbol TEXT NOT NULL,
        mindshare REAL DEFAULT 0,
        liquidity REAL DEFAULT 0,
        volume_24h REAL DEFAULT 0,
        holders_count REAL DEFAULT 0,
        price REAL DEFAULT 0,
        price_momentum REAL DEFAULT 0,
        volume_momentum REAL DEFAULT 0,
        mindshare_momentum REAL DEFAULT 0,
        liquidity_momentum REAL DEFAULT 0,
        holders_momentum REAL DEFAULT 0,
        social_momentum REAL DEFAULT 0,
        total_score REAL DEFAULT 0,
        stop_loss_level REAL DEFAULT NULL,  -- ✅ NEU: Stop-Loss-Level
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        buy_signal BOOLEAN DEFAULT FALSE,
        sell_signal BOOLEAN DEFAULT FALSE,
        entry_price REAL,
        exit_price REAL,
        profit_loss REAL,
        finalized BOOLEAN DEFAULT FALSE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS unique_open_trade 
        ON token_metrics (token_address, chain_id) 
        WHERE finalized = FALSE;
      
      CREATE TABLE IF NOT EXISTS token_metrics_history (
        id SERIAL PRIMARY KEY,
        token_address TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        chain_name TEXT NOT NULL,
        symbol TEXT NOT NULL,
        mindshare REAL DEFAULT 0,
        liquidity REAL DEFAULT 0,
        volume_24h REAL DEFAULT 0,
        holders_count REAL DEFAULT 0,
        price REAL DEFAULT 0,
        price_momentum REAL DEFAULT 0,
        volume_momentum REAL DEFAULT 0,
        mindshare_momentum REAL DEFAULT 0,
        liquidity_momentum REAL DEFAULT 0,
        holders_momentum REAL DEFAULT 0,
        social_momentum REAL DEFAULT 0,
        total_score REAL DEFAULT 0,
        stop_loss_level REAL DEFAULT NULL,  -- ✅ NEU: Stop-Loss-Level
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await this.db.query(query);
  }

  async insertHistoricalMetrics(metrics: TokenMetrics): Promise<boolean> {
    const query = `
    INSERT INTO token_metrics_history (
      token_address, chain_id, chain_name, symbol, mindshare, liquidity,
      volume_24h, holders_count, price,
      price_momentum, volume_momentum, mindshare_momentum, liquidity_momentum,
      holders_momentum, social_momentum, total_score, stop_loss_level, timestamp
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14, $15, $16, $17, $18
    );
  `;

    try {
      await this.db.query(query, [
        metrics.token_address,
        metrics.chain_id,
        metrics.chain_name,
        metrics.symbol,
        metrics.mindshare,
        metrics.liquidity,
        metrics.volume_24h,
        metrics.holders_count,
        metrics.price,
        metrics.price_momentum,
        metrics.volume_momentum,
        metrics.mindshare_momentum,
        metrics.liquidity_momentum,
        metrics.holders_momentum,
        metrics.social_momentum,
        metrics.total_score,
        metrics.stop_loss_level, // ✅ Neu hinzugefügt
        metrics.timestamp,
      ]);
      console.log(
        `✅ Historische Daten für ${metrics.token_address} gespeichert.`
      );
      return true;
    } catch (error) {
      console.error(
        "❌ Fehler beim Speichern in token_metrics_history:",
        error
      );
      return false;
    }
  }

  async upsertTokenMetrics(metrics: TokenMetrics): Promise<boolean> {
    const query = `
  INSERT INTO token_metrics (
    token_address, chain_id, chain_name, symbol, mindshare, liquidity, 
    volume_24h, holders_count, price,
    price_momentum, volume_momentum, mindshare_momentum, liquidity_momentum,
    holders_momentum, social_momentum, total_score, stop_loss_level,
    timestamp, buy_signal, sell_signal, entry_price, exit_price, profit_loss, finalized
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9,
    $10, $11, $12, $13, $14, $15, $16, $17,
    $18, $19, $20, $21, $22, $23, $24
  )
  ON CONFLICT (token_address, chain_id)
  WHERE finalized = FALSE
  DO UPDATE SET
    chain_name = EXCLUDED.chain_name,
    symbol = EXCLUDED.symbol,
    mindshare = EXCLUDED.mindshare,
    liquidity = EXCLUDED.liquidity,
    volume_24h = EXCLUDED.volume_24h,
    holders_count = EXCLUDED.holders_count,
    price = EXCLUDED.price,
    price_momentum = EXCLUDED.price_momentum,
    volume_momentum = EXCLUDED.volume_momentum,
    mindshare_momentum = EXCLUDED.mindshare_momentum,
    liquidity_momentum = EXCLUDED.liquidity_momentum,
    holders_momentum = EXCLUDED.holders_momentum,
    social_momentum = EXCLUDED.social_momentum,
    total_score = EXCLUDED.total_score,
    stop_loss_level = EXCLUDED.stop_loss_level, 
    timestamp = EXCLUDED.timestamp,
    buy_signal = EXCLUDED.buy_signal,
    sell_signal = EXCLUDED.sell_signal,
    entry_price = COALESCE(token_metrics.entry_price, EXCLUDED.entry_price),
    exit_price = COALESCE(token_metrics.exit_price, EXCLUDED.exit_price),
    profit_loss = COALESCE(token_metrics.profit_loss, EXCLUDED.profit_loss),
    finalized = EXCLUDED.finalized;
`;

    try {
      await this.db.query(query, [
        metrics.token_address,
        metrics.chain_id,
        metrics.chain_name,
        metrics.symbol,
        metrics.mindshare,
        metrics.liquidity,
        metrics.volume_24h,
        metrics.holders_count,
        metrics.price,
        metrics.price_momentum,
        metrics.volume_momentum,
        metrics.mindshare_momentum,
        metrics.liquidity_momentum,
        metrics.holders_momentum,
        metrics.social_momentum,
        metrics.total_score,
        metrics.stop_loss_level, // ✅ Neu hinzugefügt
        metrics.timestamp,
        metrics.buy_signal,
        metrics.sell_signal,
        metrics.entry_price ?? null,
        metrics.exit_price ?? null,
        metrics.profit_loss ?? null,
        metrics.finalized,
      ]);
      console.log(`✅ TokenMetrics für ${metrics.token_address} gespeichert.`);
      return true;
    } catch (error) {
      console.error("❌ Fehler beim Upsert von Token-Metriken:", error);
      return false;
    }
  }

  async getLatestTokenMetricsForToken(
    token_address: string
  ): Promise<TokenMetrics[]> {
    const result = await this.db.query(
      `SELECT * FROM token_metrics_history WHERE token_address = $1 ORDER BY timestamp DESC LIMIT 3`,
      [token_address]
    );
    return result.rows;
  }

  async getTokensToSell(): Promise<TokenMetrics[]> {
    const result = await this.db.query(
      `SELECT * FROM token_metrics WHERE sell_signal = TRUE AND finalized = FALSE`
    );
    return result.rows; // ✅ Nur die Daten zurückgeben
  }

  async getTokensToBuy(): Promise<TokenMetrics[]> {
    const result = await this.db.query(
      `SELECT * FROM token_metrics WHERE buy_signal = TRUE AND finalized = FALSE AND ENTRY_PRICE IS NULL`
    );
    return result.rows; // ✅ Nur die Daten zurückgeben
  }

  async getActiveTrades(): Promise<TokenMetrics[]> {
    const result = await this.db.query(
      `SELECT * FROM token_metrics WHERE entry_price IS NOT NULL AND finalized = FALSE`
    );
    return result.rows; // ✅ Nur die Daten zurückgeben
  }

  async getLatestTokenMetrics(count = 5): Promise<TokenMetrics[]> {
    const result = await this.db.query(
      `SELECT * FROM token_metrics ORDER BY timestamp DESC LIMIT $1`,
      [count]
    );
    return result.rows; // ✅ Nur die Daten zurückgeben
  }

  async flagForSelling(token_address: string, chain_id: number) {
    await this.db.query(
      `UPDATE token_metrics SET sell_signal = TRUE WHERE token_address = $1 AND chain_id = $2`,
      [token_address, chain_id]
    );
  }

  async finalizeTrade(
    token_address: string,
    chain_id: number,
    exit_price: number,
    profit_loss: number
  ) {
    await this.db.query(
      `UPDATE token_metrics SET finalized = TRUE, exit_price = $1, profit_loss = $2 WHERE token_address = $3 AND chain_id = $4`,
      [exit_price, profit_loss, token_address, chain_id]
    );
  }

  async updateExitPrice(
    token_address: string,
    exit_price: number,
    profit_loss: number
  ): Promise<void> {
    await this.db.query(
      `UPDATE token_metrics SET exit_price = $1, profit_loss = $2 WHERE token_address = $3 AND exit_price IS NULL`,
      [exit_price, profit_loss, token_address]
    );
  }

  async removeTokenMetrics(token_address: string): Promise<boolean> {
    try {
      await this.db.query(
        `DELETE FROM token_metrics WHERE token_address = $1`,
        [token_address]
      );
      console.log(`🗑 Token-Metriken für ${token_address} gelöscht.`);
      return true;
    } catch (error) {
      console.error("❌ Fehler beim Löschen der Token-Metriken:", error);
      return false;
    }
  }

  async cleanupAllTokenMetrics(): Promise<void> {
    try {
      await this.db.query(`DELETE FROM token_metrics`);
      console.log("🧹 Alle Token-Metriken wurden gelöscht.");
    } catch (error) {
      console.error("❌ Fehler beim Bereinigen der Token-Metriken:", error);
    }
  }

  async close() {
    await this.db.close();
  }
}
