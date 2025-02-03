import type { IAgentRuntime } from "@elizaos/core";
import { Chain } from './types/Chain';

//-------------------------------Stellschrauben--------------------------------
export const ACTIVE_CHAIN = 'arbitrum' as const;

// Trading parameters
export const TRADE_AMOUNT = '0.01'; // ETH
export const PROFIT_TARGET = 30; // 30%
export const STOP_LOSS = -20; // -20%

// Chain configurations
export const CHAINS = {
  arbitrum: {
    id: 42161,
    name: 'arbitrum',
    explorer: 'https://arbiscan.io/tx/'
  },
  mode: {
    id: 34443,
    name: 'mode',
    explorer: 'https://explorer.mode.network/tx/'
  },
  avalanche: {
    id: 43114,
    name: 'avalanche',
    explorer: 'https://snowtrace.io/tx/'
  }
} as const;

export type ChainConfig = typeof CHAINS[keyof typeof CHAINS];

// Helper to get chain settings
export function getChainSettings(runtime: IAgentRuntime, chainName: string) {
  const chain = chainName.toUpperCase();
  return {
    rpcUrl: runtime.getSetting(`${chain}_RPC_URL`),
    privateKey: runtime.getSetting(`${chain}_WALLET_PRIVATE_KEY`),
    routerAddress: runtime.getSetting(`${chain}_UNISWAP_ROUTER`),
    wethAddress: runtime.getSetting(`${chain}_WETH`)
  };
}
//-------------------------------Stellschrauben-------------------------------- 