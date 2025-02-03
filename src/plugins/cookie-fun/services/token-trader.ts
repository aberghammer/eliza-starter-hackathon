import { elizaLogger, type IAgentRuntime, type HandlerCallback } from "@elizaos/core";
import { TradeExecutionProvider } from "../providers/trade-execution-provider.ts";
import { TokenMetricsProvider } from "../providers/token-metrics-provider.ts";
import { TRADE_AMOUNT, getChainSettings } from "../config.ts";
import { stringToChain, getChainId, getExplorerUrl } from '../utils/chain-utils.ts';
import BetterSQLite3 from "better-sqlite3";
import { ethers } from "ethers";
import type { BuyParams, SellParams, TradeResult } from "../types/Trading.ts";

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
      return { 
        success: false, 
        error: error.message,
        symbol: "",
        price: 0,
        tradeId: "",
        profitLossPercent: 0,
        tokensSpent: 0,
        ethReceived: 0
      };
    }
  }

  async processPendingBuys(runtime: IAgentRuntime): Promise<boolean> {
    try {
      const tokensToBuy = this.tokenMetricsProvider.getTokensToBuy();
      elizaLogger.log(`Found ${tokensToBuy.length} tokens with buy signals`);
      
      for (const token of tokensToBuy) {
        try {
          const result = await this.executeBuy({
            tokenAddress: token.tokenAddress,
            chainName: token.chainName,
            amount: TRADE_AMOUNT,
            runtime
          });

          if (!result.success) {
            elizaLogger.error(`Failed to buy ${result.symbol}`);
            continue;
          }

          // Update only what changed after buying
          const updatedMetrics = {
            ...token,
            buySignal: false,        // Reset buy flag
            entryPrice: result.price, // Set entry price
            timestamp: new Date().toISOString()
          };

          this.tokenMetricsProvider.upsertTokenMetrics(updatedMetrics);
          elizaLogger.log(`✅ Bought ${result.symbol} at ${result.price}`);
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
    
    elizaLogger.log(
      `🚀 Sending buy transaction: Token: ${tokenAddress} || Chain: ${chainName} || Amount: ${amount} ETH (${amountInWei} wei) || Router: ${settings.routerAddress}`
    );

    const tradeResult = await tradeExecutor.buyToken(tokenAddress, amountInWei);
    if (!tradeResult) {
      throw new Error("Trade execution failed");
    }

    elizaLogger.log(`✅ Buy transaction successful. TxHash: ${tradeResult.tradeId}`);

    return {
      success: true,
      symbol: tradeResult.symbol,
      price: tradeResult.price,
      tradeId: tradeResult.tradeId,
      profitLossPercent: 0,  // Not applicable for buys
      tokensSpent: 0,        // Not applicable for buys
      ethReceived: 0         // Not applicable for buys
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
      return { 
        success: false, 
        error: error.message,
        symbol: "",
        price: 0,
        tradeId: "",
        profitLossPercent: 0,
        tokensSpent: 0,
        ethReceived: 0
      };
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

          const profitOrLoss = result.profitLossPercent >= 0 ? 'profit' : 'loss';
          const ethDiff = result.ethReceived - parseFloat(TRADE_AMOUNT);
          const ethDiffFormatted = ethDiff.toFixed(6);
          const ethResult = ethDiff >= 0 ? `gained ${ethDiffFormatted}` : `lost ${Math.abs(ethDiff).toFixed(6)}`;

          elizaLogger.log(
            `✅ Sold ${result.symbol} with ${profitOrLoss} | Entry: ${token.entryPrice} ETH | Exit: ${result.price} ETH | Amount: ${result.tokensSpent} tokens | P/L: ${result.profitLossPercent}% | ETH ${ethResult} ETH`
          );
        } catch (error) {
          elizaLogger.error(`❌ Error selling ${token.symbol}:`, error.message || error);
        }
      }

      return true;
    } catch (error) {
      elizaLogger.error("❌ Error processing pending sells:", error.message || error);
      return false;
    }
  }

  private async executeSell(params: SellParams): Promise<TradeResult> {
    const { tokenAddress, chainName, runtime } = params;

    try {
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

      // Get token balance with retry
      let balance;
      let retries = 3;
      while (retries > 0) {
        try {
          balance = await this.getTokenBalance(tokenAddress, chainName, runtime);
          break;
        } catch (error) {
          retries--;
          if (retries === 0) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between retries
        }
      }

      if (!balance || balance === BigInt(0)) {
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
        profitLossPercent,
        tokensSpent: parseFloat(ethers.formatEther(balance)),
        ethReceived: tradeResult.price * parseFloat(ethers.formatEther(balance))
      };
    } catch (error) {
      elizaLogger.error("❌ Error executing sell:", error);
      return {
        success: false,
        error: error.message,
        symbol: "",
        price: 0,
        tradeId: "",
        profitLossPercent: 0,
        tokensSpent: 0,
        ethReceived: 0
      };
    }
  }
} 