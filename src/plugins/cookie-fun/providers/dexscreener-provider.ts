export class DexscreenerProvider {
  private readonly API_URL = "https://api.dexscreener.com/latest/dex/tokens/";

  /**
   * Fetches the latest price of a token from Dexscreener
   * @param contractAddress - The token's contract address
   * @returns The token price and liquidity info
   */
  public async fetchTokenPrice(contractAddress: string): Promise<any> {
    const url = `${this.API_URL}${contractAddress}`;

    try {
      console.log(`📡 Fetching price from Dexscreener: ${url}`);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `⚠️ Dexscreener API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      if (!data.pairs || data.pairs.length === 0) {
        throw new Error("❌ No trading pairs found for this token.");
      }

      // Nimm den ersten Eintrag aus der API-Response (meist das aktivste Paar)
      const tokenData = data.pairs[0];

      return {
        symbol: tokenData.baseToken.symbol,
        price: parseFloat(tokenData.priceUsd),
        liquidity: parseFloat(tokenData.liquidity.usd),
        volume24h: parseFloat(tokenData.volume.h24),
        url: tokenData.url, // Link zur Dexscreener Seite
      };
    } catch (error) {
      console.error("❌ Error fetching price:", error);
      throw error;
    }
  }
}
