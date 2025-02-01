import { elizaLogger } from "@elizaos/core";
import { ethers } from 'ethers';
import { TradeLog } from '../types/TradeLog';

export class TradeExecutionProvider {
  private readonly provider: ethers.JsonRpcProvider;
  private readonly wallet: ethers.Wallet;
  private readonly SLIPPAGE = 0.5; // 0.5% slippage tolerance
  private readonly ROUTER_ADDRESS: string;
  private readonly WETH_ADDRESS: string;

  constructor(
    rpcUrl: string, 
    privateKey: string,
    routerAddress: string,
    wethAddress: string
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.ROUTER_ADDRESS = routerAddress;
    this.WETH_ADDRESS = wethAddress;
  }

  async buyToken(
    tokenAddress: string,
    amountInWei: string
  ): Promise<TradeLog | null> {
    try {
      elizaLogger.log(`🔄 Trade execution details:`, {
        tokenAddress,
        amountInWei,
        amountInEth: ethers.formatEther(amountInWei),
        routerAddress: this.ROUTER_ADDRESS,
        wethAddress: this.WETH_ADDRESS
      });

      // Get token info
      const tokenAbi = ["function symbol() view returns (string)"];
      const token = new ethers.Contract(tokenAddress, tokenAbi, this.provider);
      const symbol = await token.symbol();

      // Router setup with getAmountsOut for price impact calculation
      const routerAbi = [
        "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
        "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)"
      ];
      const router = new ethers.Contract(this.ROUTER_ADDRESS, routerAbi, this.wallet);
      const path = [this.WETH_ADDRESS, tokenAddress];
      const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes

      // Calculate minimum output amount with slippage
      const amounts = await router.getAmountsOut(amountInWei, path);
      const amountOutMin = amounts[1] - (amounts[1] * BigInt(Math.floor(this.SLIPPAGE * 100)) / BigInt(10000));

      elizaLogger.log("🔄 Preparing transaction parameters...", {
        amountOutMin: amountOutMin.toString(),
        expectedOutput: amounts[1].toString(),
        slippage: `${this.SLIPPAGE}%`
      });
      
      const tx = await router.swapExactETHForTokens(
        amountOutMin,
        path,
        this.wallet.address,
        deadline,
        {
          value: amountInWei
        }
      );

      elizaLogger.log("📝 Transaction sent:", tx.hash);
      const receipt = await tx.wait();
      elizaLogger.log("✅ Transaction confirmed:", receipt);

      // Calculate actual amount received from transaction events
      const transferEvent = receipt.logs
        .map(log => {
          try {
            return {
              address: log.address.toLowerCase(),
              data: log.data,
              topics: log.topics
            };
          } catch {
            return null;
          }
        })
        .filter(log => log?.address === tokenAddress.toLowerCase())
        .pop();

      const amountReceived = transferEvent ? BigInt(transferEvent.data) : BigInt(0);
      const effectivePrice = parseFloat(ethers.formatEther(amountInWei)) / 
                           parseFloat(ethers.formatEther(amountReceived));

      const tradeLog: TradeLog = {
        tradeId: receipt.hash,
        tokenAddress,
        symbol,
        action: 'BUY',
        price: effectivePrice,
        amount: parseFloat(ethers.formatEther(amountReceived)),
        timestamp: new Date().toISOString()
      };

      elizaLogger.log(`✅ Successfully bought ${symbol} on Arbitrum`, tradeLog);
      return tradeLog;

    } catch (error) {
      elizaLogger.error("❌ Trade execution error:", {
        error,
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      return null;
    }
  }
} 