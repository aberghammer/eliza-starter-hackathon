import { elizaLogger } from "@elizaos/core";
import { ethers } from "ethers";
import type { TradeLog } from "../types/TradeLog.ts";
import { Chain } from "../types/Chain.ts";
import type { IAgentRuntime } from "@elizaos/core";
import { ACTIVE_CHAIN } from "../config.ts";

export class TradeExecutionProvider {
  private readonly provider: ethers.JsonRpcProvider;
  private readonly wallet: ethers.Wallet;
  private readonly SLIPPAGE = 0.5; // 0.5% slippage tolerance
  private readonly ROUTER_ADDRESS: string;
  private readonly WETH_ADDRESS: string;

  constructor(chain: Chain, runtime: IAgentRuntime) {
    const rpcUrl = runtime.getSetting(`${chain.toUpperCase()}_RPC_URL`);
    let privateKey = runtime.getSetting(`${chain.toUpperCase()}_WALLET_PRIVATE_KEY`);
    
    // Handle the ${ARBITRUM_WALLET_PRIVATE_KEY} substitution
    if (privateKey?.includes('${ARBITRUM_WALLET_PRIVATE_KEY}')) {
        privateKey = runtime.getSetting('ARBITRUM_WALLET_PRIVATE_KEY');
    }

    const routerAddress = runtime.getSetting(
      `${chain.toUpperCase()}_UNISWAP_ROUTER`
    );
    const wethAddress = runtime.getSetting(`${chain.toUpperCase()}_WETH`);

    elizaLogger.log("Chain:", chain);
    elizaLogger.log("Private Key:", privateKey ? 'exists' : 'missing');

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
    // First check if pool exists
    const factoryAddress = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
    const factoryAbi = ['function getPool(address,address,uint24) view returns (address)'];
    const factory = new ethers.Contract(factoryAddress, factoryAbi, this.provider);
    
    const pool = await factory.getPool(tokenIn, tokenOut, 3000);
    elizaLogger.log("Pool address:", pool);
    
    // Add liquidity check
    const poolAbi = ['function liquidity() external view returns (uint128)'];
    const poolContract = new ethers.Contract(pool, poolAbi, this.provider);
    const liquidity = await poolContract.liquidity();
    elizaLogger.log("Pool liquidity:", liquidity.toString());
    
    if (liquidity === BigInt(0)) {
        throw new Error('Pool exists but has no liquidity');
    }

    const network = await this.provider.getNetwork();
    
    // Use chain-specific Quoter V2 addresses
    const QUOTER_V2 = {
        arbitrum: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
        base: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a'  // Correct Base QuoterV2 from docs
    }[network.name] || '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';

    const quoterAbi = [
        'function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut)'
    ];
    
    const quoter = new ethers.Contract(QUOTER_V2, quoterAbi, this.provider);
    
    try {
        elizaLogger.log("Getting quote for:", {
            tokenIn,
            tokenOut,
            amountIn,
            fee: 3000,
            quoter: QUOTER_V2
        });

        // Encode the path
        const path = ethers.solidityPacked(
            ['address', 'uint24', 'address'],
            [tokenIn, 3000, tokenOut]
        );

        const amountOut = await quoter.quoteExactInput.staticCall(path, amountIn);

        elizaLogger.log("Quote received:", amountOut.toString());
        return amountOut;
    } catch (error) {
        elizaLogger.error("Error getting quote:", error);
        throw error;
    }
  }

  async buyToken(
    tokenAddress: string,
    amountInWei: string
  ): Promise<TradeLog | null> {
    try {
      elizaLogger.log("📝 BUY TOKEN " + tokenAddress);

      elizaLogger.log("provider" + (await this.provider.getNetwork())); //er kackt ab sobald ich auf den provider zugreifen will

      // Get token info
      const tokenAbi = ["function symbol() view returns (string)"];
      const token = new ethers.Contract(tokenAddress, tokenAbi, this.provider);
      const symbol = await token.symbol();

      // Router setup with getAmountsOut for price impact calculation
      const routerAbi = [
        'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)'
      ];
      const router = new ethers.Contract(
        this.ROUTER_ADDRESS,
        routerAbi,
        this.wallet
      );
      const path = [this.WETH_ADDRESS, tokenAddress];
      const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes

      elizaLogger.log("📝 CHECKING ROUTER");

      elizaLogger.log("🔍 Checking price impact for trade:");
      elizaLogger.log("WETH_ADDRESS:", this.WETH_ADDRESS);
      elizaLogger.log("Token Address:", tokenAddress);
      elizaLogger.log("Amount In:", amountInWei);
      elizaLogger.log("Path:", path);
      elizaLogger.log("Deadline:", deadline);
      elizaLogger.log("Router Address:", this.ROUTER_ADDRESS);
      elizaLogger.log("Wallet Address:", this.wallet.address);

      // Get quote and calculate minimum output with slippage
      const amountOut = await this.getAmountOut(amountInWei, this.WETH_ADDRESS, tokenAddress);
      const amountOutMin = amountOut - (amountOut * BigInt(Math.floor(this.SLIPPAGE * 100))) / BigInt(10000);

      elizaLogger.log("📝 READY TO SEND:");

      const tx = await router.exactInputSingle(
        {
          tokenIn: this.WETH_ADDRESS,
          tokenOut: tokenAddress,
          fee: 3000,
          recipient: this.wallet.address,
          deadline: deadline,
          amountIn: amountInWei,
          amountOutMinimum: amountOutMin,
          sqrtPriceLimitX96: 0
        },
        { value: amountInWei }
      );

      elizaLogger.log("📝 Transaction sent:", tx.hash);
      const receipt = await tx.wait();
      elizaLogger.log("✅ Transaction confirmed:", receipt);

      // Calculate actual amount received from transaction events
      const transferEvent = receipt.logs
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
        .filter((log) => log?.address === tokenAddress.toLowerCase())
        .pop();

      const amountReceived = transferEvent
        ? BigInt(transferEvent.data)
        : BigInt(0);
      const effectivePrice =
        parseFloat(ethers.formatEther(amountInWei)) /
        parseFloat(ethers.formatEther(amountReceived));

      const tradeLog: TradeLog = {
        tradeId: receipt.hash,
        tokenAddress,
        symbol,
        action: "BUY",
        price: effectivePrice,
        amount: parseFloat(ethers.formatEther(amountReceived)),
        timestamp: new Date().toISOString(),
      };

      elizaLogger.log(
        `✅ Successfully bought ${symbol} on ${ACTIVE_CHAIN}`,
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
        `✅ Successfully sold ${symbol} on ${ACTIVE_CHAIN}`,
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
}

