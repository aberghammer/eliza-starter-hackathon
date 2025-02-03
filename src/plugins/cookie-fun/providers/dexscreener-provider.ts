import { elizaLogger } from "@elizaos/core";
import type { TokenMetrics } from "../types/TokenMetrics.ts";

export class DexscreenerProvider {
  private readonly API_URL = "https://api.dexscreener.com/latest/dex/tokens/";

  /**
   * Fetches the latest price of a token from Dexscreener
   * @param contractAddress - The token's contract address
   * @returns The token price and liquidity info
   */
  public async fetchTokenPrice(tokenAddress: string): Promise<any> {
    const url = `${this.API_URL}${tokenAddress}`;
    elizaLogger.log(`📡 Fetching price from Dexscreener: ${url}`);

    const response = await fetch(url);
    const data = await response.json();

    // We should return the same format we used when buying
    return data;
  }
}
