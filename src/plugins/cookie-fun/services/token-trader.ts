import { elizaLogger, type IAgentRuntime, type HandlerCallback } from "@elizaos/core";
import { TradeExecutionProvider } from "../providers/trade-execution-provider";
import { TokenMetricsProvider } from "../providers/token-metrics-provider";
import { TRADE_AMOUNT, getChainSettings } from "../config";
import { stringToChain, getChainId, getExplorerUrl } from '../utils/chain-utils';
import BetterSQLite3 from "better-sqlite3";
import { ethers } from "ethers";
import type { BuyParams, SellParams, TradeResult } from "../types/trading";

export class TokenTrader {
  private tokenMetricsProvider: TokenMetricsProvider;

  constructor(private db = new BetterSQLite3("data/db.sqlite")) {
    this.tokenMetricsProvider = new TokenMetricsProvider(db);
  }

  async manualBuy(params: BuyParams): Promise<TradeResult> {
    try {
      const result = await this.executeBuy(params);
      
      if (params.callback) {
        const explorerUrl = getExplorerUrl(params.chainName);
        params.callback({
          text: `Successfully bought ${result.symbol} for ${params.amount || TRADE_AMOUNT} ETH\nTransaction: ${explorerUrl}${result.tradeId}`.replace(/\n/g, ' '),
          action: "TOKEN_BOUGHT",
          data: result
        });
      }

      return { success: true, ...result };
    } catch (error) {
      elizaLogger.error("❌ Error in manual buy:", error);
      if (params.callback) {
        params.callback({
          text: `Failed to buy token: ${error.message}`,
          action: "BUY_ERROR",
        });
      }
      return { success: false, error: error.message };
    }
  }

  async processPendingBuys(runtime: IAgentRuntime): Promise<boolean> {
    try {
      const tokensToBuy = this.tokenMetricsProvider.getTokensToBuy();
      
      for (const token of tokensToBuy) {
        try {
          const result = await this.executeBuy({
            tokenAddress: token.tokenAddress,
            chainName: token.chainName,
            amount: TRADE_AMOUNT,
            runtime
          });

          if (!result.success) {
            elizaLogger.error(`Failed to buy ${token.symbol}`);
            continue;
          }

          // Update token metrics
          token.entryPrice = result.price;
          token.buySignal = false;
          token.timestamp = new Date().toISOString();
          this.tokenMetricsProvider.upsertTokenMetrics(token);

          elizaLogger.log(`✅ Bought ${token.symbol} at ${result.price}`);
        } catch (error) {
          elizaLogger.error(`❌ Error buying ${token.symbol}:`, error);
        }
      }

      return true;
    } catch (error) {
      elizaLogger.error("❌ Error processing pending buys:", error);
      return false;
    }
  }

  private async getTokenBalance(tokenAddress: string, chainName: string, runtime: IAgentRuntime): Promise<bigint> {
    const settings = getChainSettings(runtime, chainName);
    if (!settings.rpcUrl || !settings.privateKey) {
      throw new Error(`Missing required ${chainName} configuration!`);
    }

    const provider = new ethers.JsonRpcProvider(settings.rpcUrl);
    const wallet = new ethers.Wallet(settings.privateKey, provider);
    
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ["function balanceOf(address) view returns (uint256)"],
      provider
    );
    
    return tokenContract.balanceOf(wallet.address);
  }

  private async executeBuy(params: BuyParams): Promise<TradeResult> {
    const { tokenAddress, chainName, amount = TRADE_AMOUNT, runtime } = params;

    const settings = getChainSettings(runtime, chainName);
    if (!settings.rpcUrl || !settings.privateKey) {
      throw new Error(`Missing required ${chainName} configuration!`);
    }

    const tradeExecutor = new TradeExecutionProvider(
      stringToChain(chainName),
      runtime
    );

    const amountInWei = ethers.parseEther(amount).toString();
    const tradeResult = await tradeExecutor.buyToken(
      tokenAddress,
      amountInWei
    );

    if (!tradeResult) {
      throw new Error("Trade execution failed");
    }

    // Save to database
    const metrics = {
      tokenAddress,
      chainId: getChainId(chainName),
      chainName,
      symbol: tradeResult.symbol,
      mindshare: 0,
      sentimentScore: 0,
      liquidity: 0,
      priceChange24h: 0,
      holderDistribution: "",
      timestamp: new Date().toISOString(),
      buySignal: false,
      entryPrice: tradeResult.price,
      finalized: false
    };

    this.tokenMetricsProvider.upsertTokenMetrics(metrics);

    return {
      success: true,
      symbol: tradeResult.symbol,
      price: tradeResult.price,
      tradeId: tradeResult.tradeId
    };
  }

  async manualSell(params: SellParams): Promise<TradeResult> {
    try {
      const result = await this.executeSell(params);
      
      if (params.callback) {
        const explorerUrl = getExplorerUrl(params.chainName);
        params.callback({
          text: `Successfully sold ${result.symbol} at ${result.profitLossPercent}% ${result.profitLossPercent >= 0 ? 'profit' : 'loss'}\nTransaction: ${explorerUrl}${result.tradeId}`.replace(/\n/g, ' '),
          action: "TOKEN_SOLD",
          data: result
        });
      }

      return { success: true, ...result };
    } catch (error) {
      elizaLogger.error("❌ Error in manual sell:", error);
      if (params.callback) {
        params.callback({
          text: `Failed to sell token: ${error.message}`,
          action: "SELL_ERROR",
        });
      }
      return { success: false, error: error.message };
    }
  }

  async processPendingSells(runtime: IAgentRuntime): Promise<boolean> {
    try {
      const tokensToSell = this.tokenMetricsProvider.getTokensToSell();
      
      for (const token of tokensToSell) {
        try {
          const result = await this.executeSell({
            tokenAddress: token.tokenAddress,
            chainName: token.chainName,
            runtime
          });

          if (!result.success) {
            elizaLogger.error(`Failed to sell ${token.symbol}`);
            continue;
          }

          elizaLogger.log(`✅ Sold ${token.symbol} at ${result.profitLossPercent}% ${result.profitLossPercent >= 0 ? 'profit' : 'loss'}`);
        } catch (error) {
          elizaLogger.error(`❌ Error selling ${token.symbol}:`, error);
        }
      }

      return true;
    } catch (error) {
      elizaLogger.error("❌ Error processing pending sells:", error);
      return false;
    }
  }

  private async executeSell(params: SellParams): Promise<TradeResult> {
    const { tokenAddress, chainName, runtime } = params;

    const settings = getChainSettings(runtime, chainName);
    if (!settings.rpcUrl || !settings.privateKey) {
      throw new Error(`Missing required ${chainName} configuration!`);
    }

    // Get token info from database
    const trade = this.tokenMetricsProvider.getActiveTrades()
      .find(t => t.tokenAddress.toLowerCase() === tokenAddress.toLowerCase());

    if (!trade) {
      throw new Error("No active trade found for this token");
    }

    const tradeExecutor = new TradeExecutionProvider(
      stringToChain(chainName),
      runtime
    );

    // Get token balance
    const balance = await this.getTokenBalance(tokenAddress, chainName, runtime);

    if (balance === BigInt(0)) {
      throw new Error("No token balance to sell");
    }

    const tradeResult = await tradeExecutor.sellToken(
      tokenAddress,
      balance.toString()
    );

    if (!tradeResult) {
      throw new Error("Trade execution failed");
    }

    // Calculate profit/loss
    const profitLossPercent = Math.round(
      ((tradeResult.price - trade.entryPrice!) / trade.entryPrice!) * 100
    );

    // Finalize the trade in database
    this.tokenMetricsProvider.finalizeTrade(
      tokenAddress,
      trade.chainId,
      tradeResult.price,
      profitLossPercent
    );

    return {
      success: true,
      symbol: tradeResult.symbol,
      price: tradeResult.price,
      tradeId: tradeResult.tradeId,
      profitLossPercent
    };
  }
} 