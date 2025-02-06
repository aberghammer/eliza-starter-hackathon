# Social Score Auto Trading AI: ELYSA

## ElizaOS Starter with Cookie.fun

As part of the Cookie **DeFAI Hackathon**, participating in both the **AI Track** and **Arbitrum Track**, we leveraged the ElizaOS starter repository to develop a custom auto-trading plugin. Our solution enables automated trading on EVM-compatible blockchains like **BASE** and **ARBITRUM**, integrating real-time on-chain data, sentiment analysis, and advanced trading logic to optimize decision-making in decentralized finance.

The AI automatically buys and sells tokens based on predefined trading signals, leveraging market trends, liquidity analysis, and AI-driven sentiment evaluation to maximize profitability while managing risk.

Buys and sells are tweetet in a regularly. Additionally, a bull post engine gives deep insights regarding the current AI token market.

## Installation

This guide explains how to install ElizaOS Starter with the custom plugin `cookie-fun`, located in `/plugins/cookie-fun`.

### Prerequisites

- **Node.js v23** (required)
- **pnpm** as package manager
- **postgreSQL** as database (tables will be created automatically)

### Installation Steps

1. **Ensure Node.js v23 is installed**  
   If not, download and install it from [Node.js official site](https://nodejs.org/).

2. **Clone the repository**

   ```sh
   git clone https://github.com/aberghammer/eliza-starter-hackathon
   cd eliza-starter-hackathon
   ```

3. **Install dependencies**

   ```sh
   pnpm install
   ```

4. **Set up environment variables**  
   Create a `.env` file in the root directory and add the required environment variables:

   ```env
   TELEGRAM_BOT_TOKEN=your-telegram-bot-token
   SERVER_PORT=3000
   DAEMON_PROCESS=false

   # ELEVENLABS SETTINGS
   ELEVENLABS_MODEL_ID=eleven_multilingual_v2
   ELEVENLABS_VOICE_ID=your-elevenlabs-voice-id

   ANTHROPIC_API_KEY=your-anthropic-api-key

   BASE_RPC_URL=your-base-rpc-url
   BASE_WALLET_PRIVATE_KEY=your-private-key
   BASE_UNISWAP_ROUTER=your-uniswap-router
   BASE_WETH=your-base-weth

   ARBITRUM_RPC_URL=your-arbitrum-rpc-url
   ARBITRUM_WALLET_PRIVATE_KEY=your-private-key
   ARBITRUM_WALLET_PUBLIC_KEY=your-public-key
   ARBITRUM_UNISWAP_ROUTER=your-uniswap-router
   ARBITRUM_WETH=your-arbitrum-weth

   DB_CONNECTION_STRING=your-database-connection-string
   POSTGRES_URL=your-postgres-url

   TWITTER_DRY_RUN=false
   TWITTER_USERNAME=your-twitter-username
   TWITTER_PASSWORD=your-twitter-password
   TWITTER_EMAIL=your-twitter-email
   COOKIE_API_KEY=your-cookie-api-key
   ```

5. **Start the project**
   ```sh
   pnpm run start
   ```

## Plugin `cookie-fun`

The `cookie-fun` plugin is located in `/plugins/cookie-fun` and will be loaded automatically.

# Housekeeping Function in Cookie-Fun Plugin

## Overview

The `housekeeping` function in the `cookie-fun` trading plugin automates key trading tasks, ensuring continuous market analysis, token purchases, and sales processing. It runs periodically and can be executed either as a single cycle or continuously in a loop.

## Actions Included

The following actions are executed within the housekeeping cycle:

- **`openPositions`**: Displays currently open trading positions.
- **`analyzeMarket`**: Analyzes market conditions and sets potential buy or sell signals.
- **`analyzeData`**: Processes market data and trends.
- **`buyToken`**: Executes buy orders based on market conditions.
- **`checkSell`**: Evaluates whether open positions should be sold.
- **`sellToken`**: Executes token sales if conditions are met.
- **`manualBuy`**: Allows manual token purchases.
- **`manualSell`**: Allows manual token sales.
- **`housekeeping`**: The main housekeeping cycle that runs all trading tasks.
- **`tweetMindshare`**: Posts trading insights on Twitter.

## Housekeeping Execution

The `housekeeping` function is responsible for executing the above actions in a structured cycle. It checks whether the process should run as a single task or in a continuous loop based on user input.

### Execution Flow:

1. **Market Analysis:**

   - Runs `analyzeMarket` to scan for potential trades.
   - Runs `analyzeData` to process and refine signals.

2. **Token Trading:**

   - Calls `buyToken` to execute pending buy orders.
   - Calls `checkSell` to evaluate sell conditions.
   - Calls `sellToken` to process sell orders.

3. **Process Completion:**
   - Logs the execution and schedules the next cycle if necessary.

## HousekeepingService Implementation

The `HousekeepingService` class handles the execution of all housekeeping actions. It ensures each step runs sequentially and logs progress.

### Key Methods:

- **`runCycle(runtime, callback?)`**

  - Runs a full housekeeping cycle, performing analysis, trading, and logging.

- **Execution Steps:**
  - Executes market analysis (`analyzeMarket` and `analyzeData`).
  - Processes pending buy and sell orders.
  - Logs and handles errors.

## Configuration

The frequency of housekeeping cycles is defined by `HOUSEKEEPING_MINUTES` in the configuration file. The function checks for the `loop` parameter to determine if it should run continuously.

## Example Usage

A user can trigger housekeeping manually via command input:

```json
{
  "user": "trader",
  "content": {
    "text": "Run housekeeping tasks with loop"
  }
}
```

The system will respond:

```json
{
  "user": "eliza",
  "content": {
    "text": "Starting continuous housekeeping tasks",
    "action": "HOUSEKEEPING"
  }
}
```

## Error Handling

If an error occurs during execution, a detailed error message is logged, and an error response is sent back to the user:

```json
{
  "text": "❌ Housekeeping error: <error_message>",
  "action": "HOUSEKEEPING_ERROR"
}
```

## Conclusion

The `housekeeping` function ensures automated and optimized trading operations, reducing manual intervention and improving trading efficiency. By continuously analyzing the market and executing trades, it keeps the system running smoothly and efficiently.

# Market Analysis and Trading Strategy in Cookie-Fun Plugin

## Overview

The `analyzeData` function is a critical component of the `cookie-fun` plugin, responsible for analyzing market data and determining buy signals based on various key metrics. This function integrates the **Cookie.fun API**, **Dexscreener API**, and **Twitter sentiment analysis** to make informed trading decisions.

## Data Sources Used

1. **Dexscreener API**

   - Provides real-time token price, liquidity, trading volume, and holders count.
   - Used to fetch token price movements and determine market trends.

2. **Cookie.fun API**

   - Analyzes Twitter mentions of a token symbol over a given time range.
   - Helps assess social media activity and mindshare.

3. **Twitter Sentiment Analysis**
   - Evaluates the sentiment of tweets mentioning the token.
   - Determines whether the overall sentiment is bullish or bearish.

## Trading Strategy

The system follows a **data-driven approach** to determine buy signals. The decision-making process involves multiple steps:

### 1. **Market Data Collection**

- The system queries **marketdata key metrics** for token price, liquidity, trading volume, and holders count.

### 2. **Social Sentiment Analysis via Cookie.fun API**

- The system retrieves tweets mentioning the token over the past 24 hours.
- If no relevant tweets are found, the token is not considered for trading.
- If tweets are found, the system conducts sentiment analysis.

### 3. **Buy Signal Evaluation**

The decision to buy a token is based on the following key metrics:

| Metric              | Description                                                               |
| ------------------- | ------------------------------------------------------------------------- |
| **Mindshare**       | The number of relevant tweets mentioning the token                        |
| **Liquidity**       | Ensures that the token has sufficient liquidity for trading               |
| **24H Volume**      | Measures the trading activity over the last 24 hours                      |
| **Holders Count**   | Checks the number of unique wallet addresses holding the token            |
| **Price Momentum**  | Detects price trends and volatility                                       |
| **Social Momentum** | Evaluates the trend of social media engagement                            |
| **Total Score**     | A computed score based on all metrics to determine overall attractiveness |

A token is assigned a **buy signal** if it meets the following criteria:

- **High social media engagement** (mindshare)
- **Healthy liquidity and trading volume**
- **Strong price momentum indicating upward movement**
- **Final sentiment check on Tweets via LLM**

### 4. **Database Update and Signal Storage**

- If a token meets the buy criteria, it is stored in the database with a **buy signal**.
- If it does not qualify, no buy signal is assigned.

## Example Execution Flow

1. **User Requests Market Analysis:**

   ```json
   {
     "user": "trader",
     "content": {
       "text": "Can you check if there are any buy signals in our system?"
     }
   }
   ```

2. **System Response:**

   ```json
   {
     "user": "eliza",
     "content": {
       "text": "I'm checking the database for active buy recommendations. Please wait...",
       "action": "ANALYZE_DATA"
     }
   }
   ```

3. **Analysis Process:**

   - Fetch token data from **Dexscreener**.
   - Retrieve Twitter mentions via **Cookie.fun API**.
   - Conduct sentiment analysis on tweets.
   - Calculate trading metrics and determine buy signals.

4. **Final Response:**
   ```json
   {
     "text": "📊 Analysis complete | Found 3 potential buy opportunities | Mindshare and sentiment analyzed | Liquidity verified",
     "action": "ANALYZE_DATA_COMPLETE"
   }
   ```

## Error Handling

If an error occurs, an appropriate message is logged, and an error response is sent:

```json
{
  "text": "❌ Error in market analysis: <error_message>",
  "action": "ANALYZE_DATA_ERROR"
}
```

## Conclusion

The `analyzeData` function is a sophisticated trading intelligence module that leverages **on-chain metrics, social sentiment, and liquidity analysis** to identify high-potential trading opportunities. By combining **Dexscreener data, Cookie.fun API, and Twitter analysis**, it enhances trading precision and ensures data-backed decision-making.

# Token Buy Execution in Cookie-Fun Plugin

## Overview

The `processPendingBuys` function is responsible for executing token purchases based on active **buy signals** in the system. It scans the database for tokens marked as **"buy"**, attempts to execute trades, and updates the database accordingly.

## Process Flow

1. **Retrieve Buy Signals**

   - The function queries the database for tokens with active **buy signals**.
   - If no tokens are found, the process exits.

2. **Iterate Through Buy Signals**

   - For each token with a **buy signal**, an attempt is made to purchase the token.

3. **Execute Buy Order**

   - Calls `executeBuy` with:
     - `tokenAddress`: The token’s smart contract address.
     - `chainName`: The blockchain network where the trade occurs.
     - `amount`: The predefined **trade amount** (`TRADE_AMOUNT`).
     - `runtime`: The execution context.

4. **Update Database After Purchase**

   - If the purchase is **successful**, the token entry is updated:
     - **Buy signal is reset** (no longer flagged for buying).
     - **Entry price is recorded**.
     - **Timestamp is updated**.

5. **Logging and Error Handling**
   - All purchases are logged.
   - If a purchase fails, an error message is recorded, and the system moves to the next token.

## Example Execution Flow

1. **Tokens Marked for Purchase:**

   ```json
   [
     {
       "token_address": "0x912ce59144191c1204e64559fe8253a0e49e6548",
       "chain_name": "Ethereum",
       "buy_signal": true
     },
     {
       "token_address": "0xabcd1234567890abcdef1234567890abcdef1234",
       "chain_name": "Binance Smart Chain",
       "buy_signal": true
     }
   ]
   ```

2. **System Execution:**

   - Token `0x912ce...` is purchased successfully and updated in the database.
   - Token `0xabcd...` fails due to low liquidity.

3. **Final Response:**
   ```json
   {
     "success": true,
     "symbol": "TOKEN",
     "tokensReceived": "100",
     "price": "0.00023 ETH",
     "tradeId": "123456789abcdef"
   }
   ```

## Error Handling

If an error occurs, the process logs the issue and continues with the next token:

```json
{
  "success": false,
  "error": "Insufficient liquidity for token ABCD"
}
```

## Conclusion

The `processPendingBuys` function ensures that all **tokens with active buy signals** are purchased systematically. By iterating through signals, executing trades, and updating the database, it enables **automated and efficient trading execution** within the Cookie-Fun plugin.

# Token Sell Execution in Cookie-Fun Plugin

## Overview

The `checkSell` function is responsible for determining whether any active trades should be sold. It evaluates various **profit and risk factors**, ensuring that tokens are sold under optimal conditions.

## Process Flow

1. **Retrieve Active Trades**

   - The system queries the database for all **active trades**.
   - If no active trades exist, the process exits.

2. **Fetch Market Data**

   - The **Dexscreener API** is used to retrieve the latest price for each token.
   - The system checks for **WETH pair prices** to determine current market value.

3. **Calculate Profit/Loss (P/L) Percentage**

   - The **P/L percentage** is computed using:
     ```
     (currentPrice - entryPrice) / entryPrice * 100
     ```
   - A positive P/L indicates profit, while a negative P/L signals a loss.

4. **Evaluate Sell Signals Based on Key Metrics**

   - A token is flagged for selling if **any** of the following conditions are met:

   | Condition                    | Description                                                                              |
   | ---------------------------- | ---------------------------------------------------------------------------------------- |
   | **Profit Target Reached**    | If P/L **≥** `PROFIT_TARGET`, the system sells to secure profit                          |
   | **Stop-Loss Triggered**      | If P/L **≤** `STOP_LOSS`, the system sells to minimize losses                            |
   | **Volume Drop**              | If trading volume has decreased by **50%** or more, it suggests declining interest       |
   | **Negative Social Momentum** | If social media discussions are **overwhelmingly bearish**, the system considers selling |
   | **Strong Price Decline**     | If price momentum is **below -2.0 (Z-Score)**, indicating a sharp downturn               |

5. **Dynamic Trailing Stop-Loss**

   - If the trade is in **strong profit (>20%)**, the system **adjusts the stop-loss** to secure gains.
   - The new stop-loss prevents unnecessary losses if the price suddenly drops.

6. **Update Database and Flag for Sale**

   - If a token meets **sell criteria**, the database is updated:
     - The **sell signal is activated**.
     - The **stop-loss level is adjusted**.
     - The **timestamp is recorded**.

7. **Logging and Error Handling**
   - Every sell decision is logged with a detailed breakdown.
   - If an error occurs, it is recorded, and the system moves to the next trade.

## Example Execution Flow

1. **User Requests Sell Check:**

   ```json
   {
     "user": "trader",
     "content": {
       "text": "Check if we should sell any tokens"
     }
   }
   ```

# Token Sell Execution in Cookie-Fun Plugin

## Overview

The `executeSell` function automates the process of selling tokens that have been flagged for sale. It retrieves active sell signals, checks balances, executes trades, and finalizes the results in the database.

## Process Flow

1. **Retrieve Tokens Marked for Selling**

   - The system queries the database for **tokens with active sell signals**.
   - If no tokens are flagged for selling, the process exits.

2. **Initialize Trade Execution**

   - The **TradeExecutionProvider** is initialized for the appropriate blockchain network.
   - The system loads the blockchain provider and wallet credentials from runtime settings.

3. **Check Token Balance**

   - The system queries the token's smart contract to determine the available balance.
   - If the balance is **zero**, the token is skipped.

4. **Execute the Sell Order**

   - The `sellToken` method is called with:
     - `token_address`: The contract address of the token.
     - `balance`: The total amount of tokens available for sale.

5. **Calculate Profit or Loss**

   - The system computes the **percentage change** between the **sell price** and the **entry price**:
     ```
     profitLossPercent = ((sellPrice - entryPrice) / entryPrice) * 100
     ```

6. **Finalize Trade in Database**

   - If the sale is successful, the system updates the database:
     - Marks the trade as **completed**.
     - Stores the **final sell price**.
     - Logs the **profit or loss percentage**.

7. **Logging and Error Handling**
   - If the sale is successful, a **profit or loss message** is logged.
   - If the trade fails, an error is recorded, and the system moves to the next token.

## Example Execution Flow

1. **Tokens Flagged for Selling:**

   ```json
   [
     {
       "token_address": "0x123abc456def...",
       "chain_name": "Ethereum",
       "entry_price": "0.0023 ETH",
       "sell_signal": true
     },
     {
       "token_address": "0x789xyz654mno...",
       "chain_name": "Arbitrum",
       "entry_price": "0.00015 ETH",
       "sell_signal": true
     }
   ]
   ```

2. **System Execution:**

   - Token `0x123abc...` is sold successfully at a **+10% profit**.
   - Token `0x789xyz...` is sold at a **-5% loss**.

3. **Final Response:**
   ```json
   {
     "text": "✅ Sell execution complete | 2 trades finalized | Avg P/L: +2.5%",
     "action": "EXECUTE_SELL_COMPLETE"
   }
   ```

## Error Handling

If an error occurs, it is logged, and the system continues processing:

```json
{
  "success": false,
  "error": "Insufficient liquidity for token ABC"
}
```

## Conclusion

The `executeSell` function ensures that **profitable trades are secured** and **losses are minimized** by dynamically executing sell orders. By using **on-chain balance verification and trade execution**, it automates the entire selling process for efficient trade management.

## License

This project is licensed under the MIT License.
