import BetterSQLite3 from "better-sqlite3";

export interface TokenMetrics {
  tokenAddress: string;
  symbol: string;
  mindshare: number;
  sentimentScore: number;
  liquidity: number;
  priceChange24h: number;
  holderDistribution: string;
  timestamp: string;
  buySignal: boolean;
  sellSignal?: boolean;
  entryPrice?: number;
  exitPrice?: number;
  profitLoss?: number;
}

export class TokenMetricsProvider {
  private db: BetterSQLite3.Database;

  constructor(db: BetterSQLite3.Database) {
    this.db = db;
    this.initializeSchema();
  }

  /**
   * Erstellt die Tabelle, falls sie nicht existiert.
   */
  private initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS token_metrics (
        tokenAddress TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        mindshare REAL NOT NULL,
        sentimentScore REAL NOT NULL,
        liquidity REAL NOT NULL,
        priceChange24h REAL NOT NULL,
        holderDistribution TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        buySignal BOOLEAN NOT NULL,
        sellSignal BOOLEAN,
        entryPrice REAL,
        exitPrice REAL,
        profitLoss REAL
      );
    `);
  }

  /**
   * Fügt eine neue Token-Metrik ein oder aktualisiert sie, falls sie bereits existiert.
   */
  upsertTokenMetrics(metrics: TokenMetrics): boolean {
    const sql = `
      INSERT INTO token_metrics (
        tokenAddress, symbol, mindshare, sentimentScore, liquidity, priceChange24h,
        holderDistribution, timestamp, buySignal, sellSignal, entryPrice, exitPrice, profitLoss
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tokenAddress) DO UPDATE SET
        mindshare = excluded.mindshare,
        sentimentScore = excluded.sentimentScore,
        liquidity = excluded.liquidity,
        priceChange24h = excluded.priceChange24h,
        holderDistribution = excluded.holderDistribution,
        timestamp = excluded.timestamp,
        buySignal = excluded.buySignal,
        sellSignal = excluded.sellSignal,
        entryPrice = excluded.entryPrice,
        exitPrice = excluded.exitPrice,
        profitLoss = excluded.profitLoss;
    `;

    try {
      this.db.prepare(sql).run(
        metrics.tokenAddress,
        metrics.symbol,
        metrics.mindshare,
        metrics.sentimentScore,
        metrics.liquidity,
        metrics.priceChange24h,
        JSON.stringify(metrics.holderDistribution ?? ""), // Falls ein Objekt, in JSON umwandeln
        metrics.timestamp.toString(),
        metrics.buySignal ? 1 : 0, // Boolean in 1/0 umwandeln
        metrics.sellSignal ? 1 : 0,
        metrics.entryPrice ?? null,
        metrics.exitPrice ?? null,
        metrics.profitLoss ?? null
      );

      console.log(`✅ TokenMetrics für ${metrics.tokenAddress} gespeichert.`);
      return true;
    } catch (error) {
      console.error("❌ Fehler beim Speichern der Token-Metriken:", error);
      return false;
    }
  }

  /**
   * Fügt eine neue Token-Metrik ein, wenn sie noch nicht existiert.
   */
  public insertTokenMetrics(metrics: TokenMetrics): boolean {
    const sql = `
        INSERT INTO token_metrics (
          tokenAddress, symbol, mindshare, sentimentScore, liquidity, priceChange24h,
          holderDistribution, timestamp, buySignal, sellSignal, entryPrice, exitPrice, profitLoss
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;

    try {
      this.db.prepare(sql).run(
        metrics.tokenAddress,
        metrics.symbol,
        metrics.mindshare,
        metrics.sentimentScore,
        metrics.liquidity,
        metrics.priceChange24h,
        JSON.stringify(metrics.holderDistribution ?? ""), // Falls ein Objekt, in JSON umwandeln
        metrics.timestamp.toString(),
        metrics.buySignal ? 1 : 0, // Boolean in 1/0 umwandeln
        metrics.sellSignal ? 1 : 0,
        metrics.entryPrice ?? null,
        metrics.exitPrice ?? null,
        metrics.profitLoss ?? null
      );

      console.log(`✅ Neuer Eintrag für ${metrics.tokenAddress} gespeichert.`);
      return true;
    } catch (error) {
      console.error("❌ Fehler beim Speichern der Token-Metriken:", error);
      return false;
    }
  }

  /**
   * Holt die letzten X gespeicherten Token-Metriken.
   */
  getLatestTokenMetrics(count = 5): TokenMetrics[] {
    const sql = `
      SELECT * FROM token_metrics
      ORDER BY timestamp DESC
      LIMIT ?;
    `;

    try {
      const rows = this.db.prepare(sql).all(count) as TokenMetrics[];
      return rows;
    } catch (error) {
      console.error("❌ Fehler beim Abrufen der Token-Metriken:", error);
      return [];
    }
  }

  public getActiveTrades(): TokenMetrics[] {
    const sql = `
      SELECT * FROM token_metrics
      WHERE entryPrice IS NOT NULL AND exitPrice IS NULL
      ORDER BY timestamp DESC;
    `;

    try {
      const rows = this.db.prepare(sql).all() as TokenMetrics[];
      return rows;
    } catch (error) {
      console.error("❌ Fehler beim Abrufen der offenen Trades:", error);
      return [];
    }
  }

  public updateExitPrice(tokenAddress: string, exitPrice: number, profitLoss: number): void {
    const sql = `
      UPDATE token_metrics
      SET exitPrice = ?,
          profitLoss = ?
      WHERE tokenAddress = ? AND exitPrice IS NULL;
    `;

    try {
      this.db.prepare(sql).run(exitPrice, profitLoss, tokenAddress);
      console.log(
        `✅ Exit price ${exitPrice} and P/L ${profitLoss}% recorded for ${tokenAddress}`
      );
    } catch (error) {
      console.error("❌ Error updating exit price:", error);
    }
  }

  /**
   * Löscht alle Token-Metriken für eine bestimmte Token-Adresse.
   */
  removeTokenMetrics(tokenAddress: string): boolean {
    const sql = `DELETE FROM token_metrics WHERE tokenAddress = ?;`;

    try {
      this.db.prepare(sql).run(tokenAddress);
      console.log(`🗑 Token-Metriken für ${tokenAddress} gelöscht.`);
      return true;
    } catch (error) {
      console.error("❌ Fehler beim Löschen der Token-Metriken:", error);
      return false;
    }
  }
}
