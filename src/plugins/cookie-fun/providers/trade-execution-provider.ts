import { elizaLogger } from "@elizaos/core";
import { ethers } from "ethers";
import type { TradeLog } from "../types/TradeLog.ts";
import { Chain } from "../types/Chain.ts";
import type { IAgentRuntime } from "@elizaos/core";

export class TradeExecutionProvider {
  private readonly SLIPPAGE = 0.5; // 0.5% slippage tolerance
  private readonly provider: ethers.JsonRpcProvider;
  private readonly wallet: ethers.Wallet;
  private readonly ROUTER_ADDRESS: string;
  private readonly WETH_ADDRESS: string;

  // Add Base-specific addresses
  private readonly BASE_ADDRESSES = {
    factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    quoter: '0x0d5e0f971ed27fbff6c2837bf31316121532048d',
    router: '0xeC8B0F7Ffe3ae75d7FfAb09429e3675bb63503e4',  // UniversalRouterV1_2
    weth: '0x4200000000000000000000000000000000000006'
  };

  constructor(chain: Chain, runtime: IAgentRuntime) {
    const rpcUrl = runtime.getSetting(`${chain.toUpperCase()}_RPC_URL`);
    let privateKey = runtime.getSetting(`${chain.toUpperCase()}_WALLET_PRIVATE_KEY`);
    
    if (privateKey?.includes('${ARBITRUM_WALLET_PRIVATE_KEY}')) {
        privateKey = runtime.getSetting('ARBITRUM_WALLET_PRIVATE_KEY');
    }

    // Use correct router address for Base
    const routerAddress = chain === 'base' ? 
        this.BASE_ADDRESSES.router :  // Use correct Base Universal Router
        runtime.getSetting(`${chain.toUpperCase()}_UNISWAP_ROUTER`);

    const wethAddress = chain === 'base' ? 
        this.BASE_ADDRESSES.weth :
        runtime.getSetting(`${chain.toUpperCase()}_WETH`);

    elizaLogger.log("Chain settings:", {
        rpcUrl,
        privateKey: privateKey ? 'exists' : 'missing',
        routerAddress,
        wethAddress
    });

    if (!rpcUrl || !privateKey || !routerAddress || !wethAddress) {
      throw new Error(`Missing required ${chain} configuration!`);
    }

    // Ensure proper 0x prefix
    const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(formattedKey, this.provider);
    this.ROUTER_ADDRESS = routerAddress;
    this.WETH_ADDRESS = wethAddress;
  }

  private async getAmountOut(amountIn: string, tokenIn: string, tokenOut: string): Promise<bigint> {
    const network = await this.provider.getNetwork();
    elizaLogger.log(`Getting quote on network: ${network.name}`);
    
    // Try all fee tiers
    const feeTiers = [100, 500, 3000, 10000];
    let bestQuote = BigInt(0);
    
    for (const fee of feeTiers) {
        try {
            // Use QuoterV2 interface
            const quoterAbi = [
                'function quoteExactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
            ];
            const quoter = new ethers.Contract(this.BASE_ADDRESSES.quoter, quoterAbi, this.provider);
            
            const params = {
                tokenIn,
                tokenOut,
                fee,
                amountIn,
                sqrtPriceLimitX96: 0
            };
            
            const [quote] = await quoter.quoteExactInputSingle.staticCall(params);
            if (quote > bestQuote) {
                bestQuote = quote;
                elizaLogger.log(`Found better quote with fee tier ${fee}: ${quote.toString()}`);
            }
        } catch (error) {
            elizaLogger.log(`No pool found for fee tier ${fee}`);
        }
    }

    if (bestQuote === BigInt(0)) {
        throw new Error('No valid pool found for this token pair');
    }

    return bestQuote;
  }

  async buyToken(tokenAddress: string, amountInWei: string): Promise<TradeLog | null> {
    try {
        const routerAbi = [
            'function multicall(uint256 deadline, bytes[] data) external payable returns (bytes[] memory)',
            'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
            'function unwrapWETH9(uint256 amountMinimum, address recipient) external payable'
        ];

        const router = new ethers.Contract(
            '0x2626664c2603336E57B271c5C0b26F421741e481',
            routerAbi,
            this.wallet
        );

        // Encode the swap function call
        const swapParams = {
            tokenIn: this.WETH_ADDRESS,
            tokenOut: tokenAddress,
            fee: 10000,  // 1% fee tier
            recipient: this.wallet.address,
            amountIn: amountInWei,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        };

        const swapData = router.interface.encodeFunctionData('exactInputSingle', [swapParams]);
        const deadline = Math.floor(Date.now() / 1000) + 300;

        // Execute multicall
        const tx = await router.multicall(
            deadline,
            [swapData],
            { 
                value: amountInWei,
                gasLimit: 500000
            }
        );

        elizaLogger.log("📝 Transaction sent:", tx.hash);
        const receipt = await tx.wait();
        elizaLogger.log("✅ Transaction confirmed:", receipt);

        // Calculate actual amounts and price
        const amountIn = BigInt(amountInWei);
        const amountOutBigInt = await this.getAmountOut(amountInWei, this.WETH_ADDRESS, tokenAddress);

        // Convert to ether for price calculation
        const ethSpent = parseFloat(ethers.formatEther(amountIn));
        const tokensReceived = parseFloat(ethers.formatEther(amountOutBigInt));

        // Calculate price as ETH/token
        const effectivePrice = ethSpent / tokensReceived;

        const tradeLog: TradeLog = {
            tradeId: receipt.hash,
            tokenAddress,
            symbol: await this.getTokenSymbol(tokenAddress),
            action: "BUY",
            price: effectivePrice,
            amount: tokensReceived,
            timestamp: new Date().toISOString(),
        };

        elizaLogger.log(
            `✅ Successfully bought ${await this.getTokenSymbol(tokenAddress)} on ${(await this.provider.getNetwork()).name}`,
            tradeLog
        );
        return tradeLog;
    } catch (error) {
        elizaLogger.error(`Buy execution error:`, error);
        return null;
    }
  }

  async sellToken(
    tokenAddress: string,
    amountToSell: string
  ): Promise<TradeLog | null> {
    try {
      // Get token info and approve spending
      const tokenAbi = [
        "function symbol() view returns (string)",
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)",
      ];
      const token = new ethers.Contract(tokenAddress, tokenAbi, this.wallet);
      const symbol = await token.symbol();

      // Check if we need to approve
      const currentAllowance = await token.allowance(
        this.ROUTER_ADDRESS
      );
      if (currentAllowance < BigInt(amountToSell)) {
        elizaLogger.log("🔄 Approving token spend...");
        const approveTx = await token.approve(
          this.ROUTER_ADDRESS,
          amountToSell
        );
        await approveTx.wait();
        elizaLogger.log("✅ Token approval confirmed");
      }

      // Router setup
      const routerAbi = [
        "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
        "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
      ];
      const router = new ethers.Contract(
        this.ROUTER_ADDRESS,
        routerAbi,
        this.wallet
      );
      const path = [tokenAddress, this.WETH_ADDRESS];
      const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes

      // Calculate minimum output amount with slippage
      const amounts = await router.getAmountsOut(amountToSell, path);
      const amountOutMin =
        amounts[1] -
        (amounts[1] * BigInt(Math.floor(this.SLIPPAGE * 100))) / BigInt(10000);

      // Execute the swap
      const tx = await router.swapExactTokensForETH(
        amountToSell,
        amountOutMin,
        path,
        this.wallet.address,
        deadline
      );

      elizaLogger.log("📝 Transaction sent:", tx.hash);
      const receipt = await tx.wait();
      elizaLogger.log("✅ Transaction confirmed:", receipt);

      // Calculate actual amount received (ETH)
      const ethReceived = receipt.logs
        .map((log) => {
          try {
            return {
              address: log.address.toLowerCase(),
              data: log.data,
              topics: log.topics,
            };
          } catch {
            return null;
          }
        })
        .filter((log) => log?.address === this.WETH_ADDRESS.toLowerCase())
        .pop();

      const amountReceived = ethReceived ? BigInt(ethReceived.data) : BigInt(0);

      // Convert amounts to ether for price calculation
      const ethAmount = parseFloat(ethers.formatEther(amountReceived));
      const tokenAmount = parseFloat(ethers.formatEther(amountToSell));

      // Calculate price as ETH/token
      const effectivePrice = ethAmount / tokenAmount;

      elizaLogger.log(`💱 Trade details:`, {
        ethReceived: ethAmount,
        tokensSpent: tokenAmount,
        pricePerToken: effectivePrice,
      });

      const tradeLog: TradeLog = {
        tradeId: receipt.hash,
        tokenAddress,
        symbol,
        action: "SELL",
        price: effectivePrice,
        amount: parseFloat(ethers.formatEther(amountToSell)),
        timestamp: new Date().toISOString(),
      };

      elizaLogger.log(
        `✅ Successfully sold ${symbol} on ${(await this.provider.getNetwork()).name}`,
        tradeLog
      );
      return tradeLog;
    } catch (error) {
      elizaLogger.error("❌ Trade execution error:", {
        error,
        message: error.message,
        code: error.code,
        stack: error.stack,
      });
      return null;
    }
  }

  private async getTokenSymbol(tokenAddress: string): Promise<string> {
    const tokenAbi = ["function symbol() view returns (string)"];
    const token = new ethers.Contract(tokenAddress, tokenAbi, this.provider);
    return await token.symbol();
  }
}