import type { Chain } from './Chain';

export interface BuyParams {
  tokenAddress: string;
  chainName: string;
  amount?: string;
  runtime: IAgentRuntime;
  callback?: HandlerCallback;
}

export interface SellParams {
  tokenAddress: string;
  chainName: string;
  runtime: IAgentRuntime;
  callback?: HandlerCallback;
}

export interface TradeResult {
  success: boolean;
  symbol?: string;
  price?: number;
  tradeId?: string;
  error?: string;
  profitLossPercent?: number;
}

export interface ChainSettings {
  rpcUrl: string;
  privateKey: string;
  routerAddress: string;
  wethAddress: string;
}

export interface TokenInfo {
  address: string;
  chain: Chain;
  symbol: string;
  decimals: number;
} 