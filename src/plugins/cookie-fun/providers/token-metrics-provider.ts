// So könnte unser token provider aussehen, der die Token-Metriken speichert und abruft.

import {
  Provider,
  IAgentRuntime,
  Memory,
  State,
  elizaLogger,
  UUID,
} from "@elizaos/core";

export class TokenMetricsProvider {
  runtime: IAgentRuntime;
  tableName: string;

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
    this.tableName = "token_metrics"; // 🏦 Die Tabelle für Token-Daten
  }

  /**
   * Speichert oder aktualisiert die Token-Metriken.
   * @param memory - Die Daten zu einem Token
   */
  async saveTokenMetrics(memory: Memory): Promise<void> {
    try {
      elizaLogger.log("💾 Storing token metrics:", memory.content);

      await this.runtime.databaseAdapter.createMemory(memory, this.tableName);
    } catch (error) {
      elizaLogger.error("❌ Error saving token metrics:", error);
    }
  }

  /**
   * Ruft die neuesten Token-Metriken für einen bestimmten Token ab.
   * @param roomId - Die Raum-ID
   * @param count - Anzahl der Ergebnisse (Standard: 1)
   */
  async getLatestTokenMetrics(roomId: UUID, count = 1): Promise<Memory[]> {
    try {
      return await this.runtime.databaseAdapter.getMemories({
        roomId: roomId,
        tableName: this.tableName,
        agentId: this.runtime.agentId,
        count,
      });
    } catch (error) {
      elizaLogger.error("❌ Error fetching token metrics:", error);
      return [];
    }
  }

  /**
   * Entfernt alle Token-Metriken für einen bestimmten Raum (z. B. wenn ein Token nicht mehr relevant ist).
   * @param roomId - Die Raum-ID
   */
  async removeTokenMetrics(roomId: UUID): Promise<void> {
    try {
      elizaLogger.log("🗑 Removing token metrics for", roomId);
      await this.runtime.databaseAdapter.removeAllMemories(
        roomId,
        this.tableName
      );
    } catch (error) {
      elizaLogger.error("❌ Error removing token metrics:", error);
    }
  }

  /**
   * Sucht nach ähnlichen Token-Daten basierend auf Preis, Volumen oder Sentiment.
   * @param embedding - Der eingebettete Vektor für Ähnlichkeitsvergleich
   * @param roomId - Die Raum-ID
   */
  async searchSimilarTokenMetrics(
    embedding: number[],
    roomId: UUID
  ): Promise<Memory[]> {
    try {
      return await this.runtime.databaseAdapter.searchMemories({
        tableName: this.tableName,
        roomId,
        agentId: this.runtime.agentId,
        embedding: embedding,
        match_threshold: 0.1,
        match_count: 5,
        unique: true,
      });
    } catch (error) {
      elizaLogger.error("❌ Error searching for similar token metrics:", error);
      return [];
    }
  }
}
