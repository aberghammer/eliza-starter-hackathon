//Nur ein Vorschlag, wie die Struktur der Token-Metriken aussehen könnte

export interface TokenMetrics {
  tokenAddress: string; // Die Smart Contract Adresse des Tokens
  symbol: string; // Token Symbol (z. B. SOL, ETH, BTC)
  mindshare: number; // Wert von Cookie API (wie oft wird darüber geredet?)
  sentimentScore: number; // Wert von Twitter Sentiment Analyse (-1 bis 1)
  liquidity: number; // Gesamtliquidität (z. B. von DexScreener)
  priceChange24h: number; // Preisänderung in 24 Stunden in Prozent
  holderDistribution: string; // Beschreibung der Whale-Konzentration
  timestamp: string; // Zeitstempel, wann das analysiert wurde
  buySignal: boolean; // Finale Entscheidung, ob ein Kauf erfolgen soll
  sellSignal?: boolean; // Falls bereits gekauft, ob verkauft werden soll
  entryPrice?: number; // Preis, zu dem gekauft wurde
  exitPrice?: number; // Preis, zu dem verkauft wurde
  profitLoss?: number; // Gewinn oder Verlust nach dem Verkauf in %
}
