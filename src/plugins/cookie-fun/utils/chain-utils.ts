import { Chain } from '../types/Chain.ts';
import { IAgentRuntime } from '@elizaos/core';
import { elizaLogger } from '@elizaos/core';

// Type guard to check if a string is a valid Chain
export function isValidChain(chain: string): chain is Chain {
  return Object.values(Chain).includes(chain as Chain);
}

// Convert string to Chain enum
export function stringToChain(chainName: string): Chain {
  if (!isValidChain(chainName.toLowerCase())) {
    throw new Error(`Unknown chain: ${chainName}`);
  }
  return chainName.toLowerCase() as Chain;
}

// Get chain ID
export function getChainId(chainName: string): number {
  const chain = stringToChain(chainName);
  switch (chain) {
    case Chain.ARBITRUM: return 42161;
    case Chain.MODE: return 34443;
    case Chain.AVALANCHE: return 43114;
    case Chain.BASE:
      return 8453;
    default:
      throw new Error(`Unsupported chain: ${chain}`);
  }
}

// Get explorer URL
export function getExplorerUrl(chainName: string): string {
  const chain = stringToChain(chainName);
  switch (chain) {
    case Chain.ARBITRUM: return 'https://arbiscan.io/tx/';
    case Chain.MODE: return 'https://explorer.mode.network/tx/';
    case Chain.AVALANCHE: return 'https://snowtrace.io/tx/';
    case Chain.BASE: return 'https://basescan.org/tx/';
  }
}

// Get display name
export function getChainDisplayName(chain: Chain): string {
  switch (chain) {
    case Chain.ARBITRUM: return 'Arbitrum';
    case Chain.MODE: return 'Mode';
    case Chain.AVALANCHE: return 'Avalanche';
    case Chain.BASE: return 'Base';
  }
}

export function getChainSettings(runtime: IAgentRuntime, chainName: string) {
  const chain = chainName.toUpperCase();
  
  // Get the private key directly from env, don't use string interpolation
  const privateKey = chain === 'BASE' 
    ? runtime.getSetting('BASE_WALLET_PRIVATE_KEY') || runtime.getSetting('ARBITRUM_WALLET_PRIVATE_KEY')
    : runtime.getSetting(`${chain}_WALLET_PRIVATE_KEY`);

  // Add debug logging
  elizaLogger.log(`Getting settings for ${chain}:`, {
    rpcUrl: runtime.getSetting(`${chain}_RPC_URL`),
    privateKey: privateKey ? 'exists' : 'missing',
    routerAddress: runtime.getSetting(`${chain}_UNISWAP_ROUTER`),
    wethAddress: runtime.getSetting(`${chain}_WETH`)
  });

  return {
    rpcUrl: runtime.getSetting(`${chain}_RPC_URL`),
    privateKey: privateKey, // Use the directly fetched private key
    routerAddress: runtime.getSetting(`${chain}_UNISWAP_ROUTER`),
    wethAddress: runtime.getSetting(`${chain}_WETH`)
  };
}