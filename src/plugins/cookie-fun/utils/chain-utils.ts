import { Chain } from '../types/Chain';

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
  }
}

// Get explorer URL
export function getExplorerUrl(chainName: string): string {
  const chain = stringToChain(chainName);
  switch (chain) {
    case Chain.ARBITRUM: return 'https://arbiscan.io/tx/';
    case Chain.MODE: return 'https://explorer.mode.network/tx/';
    case Chain.AVALANCHE: return 'https://snowtrace.io/tx/';
  }
}

// Get display name
export function getChainDisplayName(chain: Chain): string {
  switch (chain) {
    case Chain.ARBITRUM: return 'Arbitrum';
    case Chain.MODE: return 'Mode';
    case Chain.AVALANCHE: return 'Avalanche';
  }
}