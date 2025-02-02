export interface TokenMetrics {
  tokenAddress: string;
  chainId: number;
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
  finalized: boolean;
}
