import BetterSQLite3 from "better-sqlite3";
import { TokenMetrics } from "../types/TokenMetrics";

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
        chainId INTEGER NOT NULL,
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
        profitLoss REAL,
        finalized BOOLEAN NOT NULL DEFAULT 0
      );
    `);
  }

  /**
   * Fügt eine neue Token-Metrik ein oder aktualisiert sie, falls sie bereits existiert.
   */
  upsertTokenMetrics(metrics: TokenMetrics): boolean {
    const sql = `
      INSERT INTO token_metrics (
        tokenAddress, chainId, symbol, mindshare, sentimentScore, liquidity, priceChange24h,
        holderDistribution, timestamp, buySignal, sellSignal, entryPrice, exitPrice, profitLoss, finalized
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tokenAddress) DO UPDATE SET
        chainId = excluded.chainId,
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
        profitLoss = excluded.profitLoss,
        finalized = excluded.finalized;
    `;

    try {
      this.db
        .prepare(sql)
        .run(
          metrics.tokenAddress,
          metrics.chainId,
          metrics.symbol,
          metrics.mindshare,
          metrics.sentimentScore,
          metrics.liquidity,
          metrics.priceChange24h,
          JSON.stringify(metrics.holderDistribution ?? ""),
          metrics.timestamp.toString(),
          metrics.buySignal ? 1 : 0,
          metrics.sellSignal ? 1 : 0,
          metrics.entryPrice ?? null,
          metrics.exitPrice ?? null,
          metrics.profitLoss ?? null,
          metrics.finalized ? 1 : 0
        );

      console.log(`✅ TokenMetrics für ${metrics.tokenAddress} gespeichert.`);
      return true;
    } catch (error) {
      console.error("❌ Fehler beim Speichern der Token-Metriken:", error);
      return false;
    }
  }

  /**
   * Holt alle offenen Trades (Token, die gekauft, aber nicht verkauft wurden).
   */
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

  /**
   * Holt alle Tokens, die gekauft werden sollten, aber noch nicht gekauft wurden.
   */
  public getShouldBuy(): TokenMetrics[] {
    const sql = `
      SELECT * FROM token_metrics
      WHERE buySignal = 1
        AND entryPrice IS NULL
        AND exitPrice IS NULL
      ORDER BY timestamp DESC;
    `;

    try {
      const rows = this.db.prepare(sql).all() as TokenMetrics[];
      return rows;
    } catch (error) {
      console.error("❌ Fehler beim Abrufen der Kaufempfehlungen:", error);
      return [];
    }
  }

  /**
   * Holt alle Verkäufe, die noch nicht als finalisiert markiert wurden.
   */
  public getUnfinalizedSales(): TokenMetrics[] {
    const sql = `
      SELECT * FROM token_metrics
      WHERE sellSignal = 1
        AND finalized = 0
      ORDER BY timestamp DESC;
    `;

    try {
      const rows = this.db.prepare(sql).all() as TokenMetrics[];
      return rows;
    } catch (error) {
      console.error(
        "❌ Fehler beim Abrufen der unfinalisierten Verkäufe:",
        error
      );
      return [];
    }
  }

  /**
   * Aktualisiert den Exit-Preis und berechnet den Profit/Loss.
   */
  public updateExitPrice(
    tokenAddress: string,
    exitPrice: number,
    profitLoss: number
  ): void {
    const sql = `
      UPDATE token_metrics
      SET exitPrice = ?,
          profitLoss = ?,
          finalized = 1
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
   * Markiert einen Trade als finalisiert.
   */
  public finalizeTrade(tokenAddress: string): void {
    const sql = `
      UPDATE token_metrics
      SET finalized = 1
      WHERE tokenAddress = ?;
    `;

    try {
      this.db.prepare(sql).run(tokenAddress);
      console.log(`✅ Trade für ${tokenAddress} als finalisiert markiert.`);
    } catch (error) {
      console.error("❌ Fehler beim Finalisieren des Trades:", error);
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

  /**
   * Bereinigt die gesamte Datenbank.
   */
  public cleanupAllTokenMetrics(): void {
    const sql = `DELETE FROM token_metrics;`;
    try {
      this.db.prepare(sql).run();
      console.log("🧹 Alle Token-Metriken aus der Datenbank gelöscht.");
    } catch (error) {
      console.error("❌ Fehler beim Bereinigen der Token-Metriken:", error);
    }
  }
}
