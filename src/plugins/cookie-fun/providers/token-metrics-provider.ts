import BetterSQLite3 from "better-sqlite3";
import { elizaLogger } from "@elizaos/core";
import type { TokenMetrics } from "../types/TokenMetrics.ts";

export class TokenMetricsProvider {
  constructor(private db: BetterSQLite3.Database) {
    this.initializeDatabase();
  }

  private initializeDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS token_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tokenAddress TEXT NOT NULL,
        chainId INTEGER NOT NULL,
        chainName TEXT NOT NULL,
        symbol TEXT NOT NULL,
        mindshare REAL DEFAULT 0,
        sentimentScore REAL DEFAULT 0,
        liquidity REAL DEFAULT 0,
        priceChange24h REAL DEFAULT 0,
        holderDistribution TEXT,
        timestamp TEXT NOT NULL,
        buySignal BOOLEAN DEFAULT FALSE,
        sellSignal BOOLEAN DEFAULT FALSE,
        entryPrice REAL,
        exitPrice REAL,
        profitLoss REAL,
        finalized BOOLEAN DEFAULT FALSE,
        UNIQUE(tokenAddress, chainId)
      );
    `);
  }

  getTokensToSell(): TokenMetrics[] {
    return this.db.prepare(`
      SELECT * FROM token_metrics 
      WHERE sellSignal = TRUE 
      AND finalized = FALSE
    `).all();
  }

  getTokensToBuy(): TokenMetrics[] {
    return this.db.prepare(`
      SELECT * FROM token_metrics 
      WHERE buySignal = TRUE 
      AND finalized = FALSE
    `).all();
  }

  getActiveTrades(): TokenMetrics[] {
    return this.db.prepare(`
      SELECT * FROM token_metrics 
      WHERE entryPrice IS NOT NULL 
      AND finalized = FALSE
    `).all();
  }

  flagForSelling(tokenAddress: string, chainId: number) {
    this.db.prepare(`
      UPDATE token_metrics 
      SET sellSignal = TRUE 
      WHERE tokenAddress = ? AND chainId = ?
    `).run(tokenAddress, chainId);
  }

  finalizeTrade(tokenAddress: string, chainId: number, exitPrice: number, profitLoss: number) {
    this.db.prepare(`
      UPDATE token_metrics 
      SET finalized = TRUE,
          exitPrice = ?,
          profitLoss = ?
      WHERE tokenAddress = ? AND chainId = ?
    `).run(exitPrice, profitLoss, tokenAddress, chainId);
  }

  /**
   * Fügt eine neue Token-Metrik ein oder aktualisiert sie, falls sie bereits existiert.
   */
  upsertTokenMetrics(metrics: TokenMetrics): boolean {
    const sql = `
      INSERT INTO token_metrics (
        tokenAddress, chainId, chainName, symbol, mindshare, sentimentScore, 
        liquidity, priceChange24h, holderDistribution, timestamp, 
        buySignal, sellSignal, entryPrice, exitPrice, profitLoss, finalized
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tokenAddress, chainId) DO UPDATE SET
        chainName = excluded.chainName,
        symbol = excluded.symbol,
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
      this.db.prepare(sql).run(
        metrics.tokenAddress,
        metrics.chainId,
        metrics.chainName,
        metrics.symbol,
        metrics.mindshare,
        metrics.sentimentScore,
        metrics.liquidity,
        metrics.priceChange24h,
        metrics.holderDistribution,
        metrics.timestamp,
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

  public cleanupAllTokenMetrics(): void {
    const sql = `DELETE FROM token_metrics;`;
    try {
      this.db.prepare(sql).run();
      console.log("🧹 Cleaned all token metrics from database");
    } catch (error) {
      console.error("❌ Error cleaning token metrics:", error);
    }
  }
}
