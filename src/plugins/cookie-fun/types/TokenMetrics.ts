export interface TokenMetrics {
  token_address: string; // Die Smart Contract Adresse des Tokens
  chain_id: number;
  chain_name: string;
  symbol: string; // Token Symbol (z. B. SOL, ETH, BTC)
  mindshare: number; // Wert von Cookie API (wie oft wird darüber geredet?)
  sentiment_score: number; // Wert von Twitter Sentiment Analyse (-1 bis 1)
  liquidity: number; // Gesamtliquidität (z. B. von DexScreener)
  price_change24h: number; // Preisänderung in 24 Stunden in Prozent
  holder_distribution: string; // Beschreibung der Whale-Konzentration
  timestamp: string; // Zeitstempel, wann das analysiert wurde
  buy_signal: boolean; // Finale Entscheidung, ob ein Kauf erfolgen soll
  sell_signal?: boolean; // Falls bereits gekauft, ob verkauft werden soll
  entry_price?: number; // Preis, zu dem gekauft wurde
  exit_price?: number; // Preis, zu dem verkauft wurde
  profit_loss?: number; // Gewinn oder Verlust nach dem Verkauf in %
  finalized: boolean;
}
