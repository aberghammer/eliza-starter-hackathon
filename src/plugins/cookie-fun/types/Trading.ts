import type { IAgentRuntime, HandlerCallback } from "@elizaos/core";
import type { Chain } from './Chain.ts';

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
  symbol: string;
  price: number;
  tradeId: string;
  tokensReceived?: string;
  profitLossPercent: number;
  tokensSpent: number;
  ethReceived: number;
  error?: string;
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