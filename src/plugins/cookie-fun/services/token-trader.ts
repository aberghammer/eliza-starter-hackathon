import {
  elizaLogger,
  type IAgentRuntime,
  type HandlerCallback,
} from "@elizaos/core";
import { TradeExecutionProvider } from "../providers/trade-execution-provider.ts";
import { TokenMetricsProvider } from "../providers/token-metrics-provider-psql.ts";
import { TRADE_AMOUNT, getChainSettings } from "../config.ts";
import {
  stringToChain,
  getChainId,
  getExplorerUrl,
} from "../utils/chain-utils.ts";

import { ethers } from "ethers";
import type { BuyParams, SellParams, TradeResult } from "../types/Trading.ts";

export class TokenTrader {
  private tokenMetricsProvider: TokenMetricsProvider;

  constructor(_runtime: IAgentRuntime) {
    this.tokenMetricsProvider = new TokenMetricsProvider(
      _runtime.getSetting("DB_CONNECTION_STRING")
    );
  }

  async manualBuy(params: BuyParams): Promise<TradeResult> {
    try {
      const result = await this.executeBuy(params);

      if (params.callback) {
        const explorerUrl = getExplorerUrl(params.chainName);
        params.callback({
          text: `Successfully bought ${result.symbol} for ${
            params.amount || TRADE_AMOUNT
          } ETH\nTransaction: ${explorerUrl}${result.tradeId}`.replace(
            /\n/g,
            " "
          ),
          action: "TOKEN_BOUGHT",
          data: result,
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
        ethReceived: 0,
      };
    }
  }

  public async processPendingBuys(runtime: IAgentRuntime): Promise<{
    success: boolean;
    symbol?: string;
    tokensReceived?: string;
    price?: string;
    tradeId?: string;
    error?: string;
  }> {
    try {
      const tokensToBuy = await this.tokenMetricsProvider.getTokensToBuy();
      elizaLogger.log(`Found ${tokensToBuy.length} tokens with buy signals`);

      for (const token of tokensToBuy) {
        try {
          const result = await this.executeBuy({
            tokenAddress: token.token_address,
            chainName: token.chain_name,
            amount: TRADE_AMOUNT,
            runtime,
          });

          elizaLogger.log(`Buy result HERE`);

          if (!result.success) {
            elizaLogger.error(`Failed to buy ${result.symbol}`);
            continue;
          }

          // Update only what changed after buying
          const updatedMetrics = {
            ...token,
            buy_signal: false, // Reset buy flag
            entry_price: result.price, // Already a number, no need to parse
            timestamp: new Date().toISOString(),
          };

          elizaLogger.log(`Updated metrics: ${JSON.stringify(updatedMetrics)}`);

          this.tokenMetricsProvider.upsertTokenMetrics(updatedMetrics);
          elizaLogger.log(`✅ Bought ${result.symbol} at ${result.price}`);

          return {
            success: true,
            symbol: result.symbol,
            tokensReceived: result.tokensReceived,
            price: result.price.toString(),
            tradeId: result.tradeId,
          };
        } catch (error) {
          elizaLogger.error(`❌ Error buying ${token.symbol}:`, error);
        }
      }
      return {
        success: true,
        symbol: undefined,
        tokensReceived: undefined,
        price: undefined,
        tradeId: undefined,
        error: undefined,
      };
    } catch (error) {
      elizaLogger.error("❌ Error processing pending buys:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private async getTokenBalance(
    tokenAddress: string,
    chainName: string,
    runtime: IAgentRuntime
  ): Promise<bigint> {
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

    elizaLogger.log(`Buy result: ${JSON.stringify(tradeResult)}`);

    if (!tradeResult) {
      throw new Error("Trade execution failed");
    }

    elizaLogger.log(
      `✅ Buy transaction successful. TxHash: ${tradeResult.tradeId}`
    );

    return {
      success: true,
      symbol: tradeResult.symbol,
      price: tradeResult.price,
      tradeId: tradeResult.tradeId,
      profitLossPercent: 0, // Not applicable for buys
      tokensSpent: 0, // Not applicable for buys
      ethReceived: 0, // Not applicable for buys
    };
  }

  async manualSell(params: SellParams): Promise<TradeResult> {
    try {
      const result = await this.executeSell(params);

      if (params.callback) {
        const explorerUrl = getExplorerUrl(params.chainName);
        params.callback({
          text: `Successfully sold ${result.symbol} at ${
            result.profitLossPercent
          }% ${
            result.profitLossPercent >= 0 ? "profit" : "loss"
          }\nTransaction: ${explorerUrl}${result.tradeId}`.replace(/\n/g, " "),
          action: "TOKEN_SOLD",
          data: result,
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
        ethReceived: 0,
      };
    }
  }

  async processPendingSells(runtime: IAgentRuntime): Promise<boolean> {
    try {
      const tokensToSell = await this.tokenMetricsProvider.getTokensToSell();

      for (const token of tokensToSell) {
        try {
          const result = await this.executeSell({
            tokenAddress: token.token_address,
            chainName: token.chain_name,
            runtime,
          });

          if (!result.success) {
            elizaLogger.error(`Failed to sell ${token.symbol}`);
            continue;
          }

          const profitOrLoss =
            result.profitLossPercent >= 0 ? "profit" : "loss";
          const ethDiff = result.ethReceived - parseFloat(TRADE_AMOUNT);
          const ethDiffFormatted = ethDiff.toFixed(6);
          const ethResult =
            ethDiff >= 0
              ? `gained ${ethDiffFormatted}`
              : `lost ${Math.abs(ethDiff).toFixed(6)}`;

          elizaLogger.log(
            `✅ Sold ${result.symbol} with ${profitOrLoss} | Entry: ${token.entry_price} ETH | Exit: ${result.price} ETH | Amount: ${result.tokensSpent} tokens | P/L: ${result.profitLossPercent}% | ETH ${ethResult} ETH`
          );
        } catch (error) {
          elizaLogger.error(
            `❌ Error selling ${token.symbol}:`,
            error.message || error
          );
        }
      }

      return true;
    } catch (error) {
      elizaLogger.error(
        "❌ Error processing pending sells:",
        error.message || error
      );
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

      // Hole aktive Trades aus der Datenbank
      const activeTrades = await this.tokenMetricsProvider.getActiveTrades();

      // Finde den passenden Trade für die Token-Adresse
      const trade = activeTrades.find(
        (t) => t.token_address.toLowerCase() === tokenAddress.toLowerCase()
      );

      if (!trade) {
        throw new Error("No active trade found for this token");
      }

      const tradeExecutor = new TradeExecutionProvider(
        stringToChain(chainName),
        runtime
      );

      // Token-Balance holen (mit Retry-Mechanismus)
      let balance;
      let retries = 3;
      while (retries > 0) {
        try {
          balance = await this.getTokenBalance(
            tokenAddress,
            chainName,
            runtime
          );
          break;
        } catch (error) {
          retries--;
          if (retries === 0) throw error;
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Warte 1s zwischen Retries
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

      // Berechne Profit oder Verlust
      const profitLossPercent = Math.round(
        ((tradeResult.price - trade.entry_price!) / trade.entry_price!) * 100
      );

      // Trade in der Datenbank finalisieren
      await this.tokenMetricsProvider.finalizeTrade(
        tokenAddress,
        trade.chain_id,
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
        ethReceived:
          tradeResult.price * parseFloat(ethers.formatEther(balance)),
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
        ethReceived: 0,
      };
    }
  }
}
