import { elizaLogger } from "@elizaos/core";

//ACHTUNG NUR DUMMER BEISPIELCODE AUS CHAT GPT

export class CookieApiProvider {
  private readonly API_URL = "https://api.cookie.fun/v2/agents/";
  private readonly API_KEY: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("API Key is required for CookieApiProvider.");
    }
    this.API_KEY = apiKey;
  }

  /**
   * Fetches agent data from Cookie API
   * @param twitterUsername - The Twitter username of the agent
   * @param interval - The interval for data analysis (e.g., _7Days)
   * @returns Parsed JSON response from the API
   */
  public async fetchAgentData(
    twitterUsername: string,
    interval: string = "_7Days"
  ): Promise<any> {
    const url = `${this.API_URL}${encodeURIComponent(
      twitterUsername
    )}?interval=${interval}`;

    try {
      elizaLogger.log(`📡 Fetching data from Cookie API: ${url}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "x-api-key": this.API_KEY,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Cookie API responded with status: ${response.status}`);
      }

      const data = await response.json();
      elizaLogger.log("✅ Successfully fetched Cookie API data:", data);
      return data;
    } catch (error) {
      console.error("❌ Error fetching Cookie API data:", error);
      throw error;
    }
  }

  /**
   * Analyzes the Cookie data and extracts relevant metrics
   * @param data - The response data from Cookie API
   * @returns Extracted and formatted metrics
   */
  public analyzeCookieData(data: any): { mindshare: number; trends: string } {
    if (!data || !data.mindshare) {
      throw new Error("Invalid Cookie API data format.");
    }

    const mindshare = data.mindshare ?? 0;
    const trends = data.trends?.join(", ") ?? "No trends available";

    elizaLogger.log(`🔍 Mindshare: ${mindshare}, Trends: ${trends}`);
    return { mindshare, trends };
  }
}
