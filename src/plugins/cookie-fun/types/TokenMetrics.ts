export interface TokenMetrics {
  token_address: string; // Die Smart Contract Adresse des Tokens
  chain_id: number;
  chain_name: string;
  symbol: string; // z. B. SOL, ETH, BTC
  mindshare: number;
  liquidity: number;
  volume_24h: number;
  holders_count: number;

  price_momentum: number;
  volume_momentum: number;
  mindshare_momentum: number;
  liquidity_momentum: number;
  holders_momentum: number;
  social_momentum: number;
  total_score: number;
  timestamp: string; // Zeitpunkt der Analyse
  buy_signal: boolean;
  sell_signal?: boolean;
  entry_price?: number;
  exit_price?: number;
  profit_loss?: number;
  finalized: boolean;
  price: number; // Aktueller Preis
  stop_loss_level?: number;
}
