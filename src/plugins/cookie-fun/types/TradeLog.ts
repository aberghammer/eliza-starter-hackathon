export interface TradeLog {
  tradeId: string; // Eindeutige ID des Trades
  tokenAddress: string; // Adresse des Tokens
  symbol: string; // Symbol des Tokens
  action: "BUY" | "SELL"; // War das ein Kauf oder Verkauf?
  price: number; // Preis des Tokens zum Zeitpunkt des Trades
  amount: number; // Anzahl der gekauften oder verkauften Tokens
  timestamp: string; // Zeitpunkt der Orderausführung
}
