import { elizaLogger } from "@elizaos/core";

export class CoinbaseProvider {
  private readonly API_URL = "https://api.coinbase.com/v2/prices/ETH-USD/spot";

  /**
   * Fetches the latest ETH/USD price from Coinbase
   * @returns The current ETH/USD spot price as a number
   */
  async fetchEthUsdPrice(): Promise<number | null> {
    try {
      const response = await fetch(this.API_URL);
      if (!response.ok) {
        elizaLogger.error(
          `❌ Error fetching ETH/USD price: ${response.statusText}`
        );
        return null;
      }

      const data = await response.json();
      const price = parseFloat(data?.data?.amount);

      if (isNaN(price)) {
        elizaLogger.error("❌ Invalid price received from Coinbase API");
        return null;
      }

      elizaLogger.log(`✅ ETH/USD Spot Price from Coinbase: $${price}`);
      return price;
    } catch (error) {
      elizaLogger.error(
        "❌ Failed to fetch ETH/USD price from Coinbase:",
        error
      );
      return null;
    }
  }
}
