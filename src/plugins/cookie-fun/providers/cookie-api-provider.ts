import { elizaLogger, IAgentRuntime } from "@elizaos/core";

export class CookieApiProvider {
  private readonly API_URL = "https://api.cookie.fun/v2/agents/";
  private readonly API_KEY: string;

  constructor(runtime: IAgentRuntime) {
    const apiKey = runtime.getSetting("COOKIE_API_KEY");

    if (!apiKey) {
      throw new Error("❌ API Key is required for CookieApiProvider.");
    }
    this.API_KEY = apiKey;
  }

  /**
   * Fetches agent data by Twitter username
   * @param twitterUsername - The Twitter username of the agent
   * @param interval - The interval (_3Days, _7Days)
   */
  public async fetchAgentByTwitter(
    twitterUsername: string,
    interval: string = "_7Days"
  ): Promise<any> {
    return this.fetchFromApi(
      `twitterUsername/${encodeURIComponent(
        twitterUsername
      )}?interval=${interval}`
    );
  }

  /**
   * Fetches agent data by contract address
   * @param contractAddress - The contract address of the agent
   * @param interval - The interval (_3Days, _7Days)
   */
  public async fetchAgentByContract(
    contractAddress: string,
    interval: string = "_7Days"
  ): Promise<any> {
    return this.fetchFromApi(
      `contractAddress/${encodeURIComponent(
        contractAddress
      )}?interval=${interval}`
    );
  }

  /**
   * Fetches a paginated list of agents ordered by mindshare
   * @param interval - The interval (_3Days, _7Days)
   * @param page - Page number (starts at 1)
   * @param pageSize - Number of agents per page (1-25)
   */
  public async fetchAgentsPaged(
    interval: string = "_7Days",
    page: number = 1,
    pageSize: number = 10
  ): Promise<any> {
    return this.fetchFromApi(
      `agentsPaged?interval=${interval}&page=${page}&pageSize=${pageSize}`
    );
  }

  /**
   * Searches for tweets with a given query in a specified date range
   * @param searchQuery - The search term or phrase
   * @param from - Start date (YYYY-MM-DD)
   * @param to - End date (YYYY-MM-DD)
   */
  public async searchTweets(
    searchQuery: string,
    from: string,
    to: string
  ): Promise<any> {
    const searchUrl = `https://api.cookie.fun/v1/hackathon/search/${encodeURIComponent(
      searchQuery
    )}?from=${from}&to=${to}`;
    return this.fetchFromApi(searchUrl, true);
  }

  /**
   * Generalized API fetch method
   * @param endpoint - The API endpoint (relative to `API_URL`)
   * @param isFullUrl - If true, treats `endpoint` as a full URL
   */
  private async fetchFromApi(
    endpoint: string,
    isFullUrl: boolean = false
  ): Promise<any> {
    const url = isFullUrl ? endpoint : `${this.API_URL}${endpoint}`;

    elizaLogger.log(`📡 Fetching data from Cookie API: ${url}`);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "x-api-key": this.API_KEY,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `⚠️ Cookie API responded with status: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      elizaLogger.log("✅ Successfully fetched Cookie API data:", data);
      return data;
    } catch (error) {
      elizaLogger.error("❌ Error fetching Cookie API data:", error);
      throw error;
    }
  }
}
