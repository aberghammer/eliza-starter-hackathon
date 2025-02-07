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
  private readonly chain: Chain;

  // Add Base-specific addresses
  private readonly BASE_ADDRESSES = {
    factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    quoter: '0x0d5e0f971ed27fbff6c2837bf31316121532048d',
    router: '0x2626664c2603336E57B271c5C0b26F421741e481',  // SwapRouter02 - this is the correct one
    weth: '0x4200000000000000000000000000000000000006'
  };

  constructor(chain: Chain, runtime: IAgentRuntime) {
    this.chain = chain;
    const rpcUrl = runtime.getSetting(`${chain.toUpperCase()}_RPC_URL`);
    const privateKey = runtime.getSetting(`${chain.toUpperCase()}_WALLET_PRIVATE_KEY`);

    // Simple check for valid private key
    if (!privateKey) {
        throw new Error('No valid private key found');
    }

    const routerAddress = chain === 'base' ? 
        this.BASE_ADDRESSES.router :
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

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
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
        if (this.chain === 'base') {
            // Keep existing Base implementation with SwapRouter02
            const routerAbi = [
                'function multicall(uint256 deadline, bytes[] data) external payable returns (bytes[] memory)',
                'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
                'function unwrapWETH9(uint256 amountMinimum, address recipient) external payable'
            ];

            const router = new ethers.Contract(
                this.ROUTER_ADDRESS,
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

            // Different transaction options based on chain
            const txOptions = {
                gasLimit: 500000,
                value: amountInWei  // Include value for all chains
            };

            // Execute multicall
            const tx = await router.multicall(
                deadline,
                [swapData],
                txOptions
            );

            elizaLogger.log("📝 Transaction sent:", tx.hash);
            const receipt = await tx.wait();
            elizaLogger.log("✅ Transaction confirmed:", receipt);

            // If transaction succeeded, parse the transfer event to get amount received
            if (receipt.status === 1) {
                // Find the token transfer log (last Transfer event)
                const transferLog = receipt.logs
                    .filter(log => log.topics[0] === ethers.id("Transfer(address,address,uint256)"))
                    .find(log => log.address.toLowerCase() === tokenAddress.toLowerCase());

                if (transferLog) {
                    const amountOut = BigInt(transferLog.data);
                    const amountIn = BigInt(amountInWei);
                    
                    const tradeLog: TradeLog = {
                        tradeId: receipt.hash,
                        tokenAddress,
                        symbol: await this.getTokenSymbol(tokenAddress),
                        action: "BUY",
                        price: Number(amountIn) / Number(amountOut),
                        amount: Number(amountOut),
                        timestamp: new Date().toISOString(),
                    };
                    return tradeLog;
                }
            }
        } else {
            // Arbitrum implementation using Uniswap V3 SwapRouter
            const routerAbi = [
                'function exactInputSingle(tuple(address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)'
            ];

            const router = new ethers.Contract(
                this.ROUTER_ADDRESS,
                routerAbi,
                this.wallet
            );

            const params = {
                tokenIn: this.WETH_ADDRESS,
                tokenOut: tokenAddress,
                fee: 3000,  // 0.3% fee tier for Arbitrum
                recipient: this.wallet.address,
                deadline: Math.floor(Date.now() / 1000) + 300,  // Add deadline
                amountIn: amountInWei,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            };

            // Encode with proper tuple structure
            const tx = await router.exactInputSingle(
                params,
                {
                    value: amountInWei,
                    gasLimit: 1000000  // Increased gas limit for Arbitrum
                }
            );

            elizaLogger.log("📝 Transaction sent:", tx.hash);
            const receipt = await tx.wait();
            elizaLogger.log("✅ Transaction confirmed:", receipt);

            // Add log parsing for Arbitrum
            if (receipt.status === 1) {
                // Find the token transfer log
                const transferLog = receipt.logs
                    .filter(log => log.topics[0] === ethers.id("Transfer(address,address,uint256)"))
                    .find(log => log.address.toLowerCase() === tokenAddress.toLowerCase());

                if (transferLog) {
                    const amountOut = BigInt(transferLog.data);
                    const amountIn = BigInt(amountInWei);
                    
                    const tradeLog: TradeLog = {
                        tradeId: receipt.hash,
                        tokenAddress,
                        symbol: await this.getTokenSymbol(tokenAddress),
                        action: "BUY",
                        price: Number(amountIn) / Number(amountOut),
                        amount: Number(amountOut),
                        timestamp: new Date().toISOString(),
                    };
                    return tradeLog;
                }
            }
        }
        // ... rest of the function (log parsing etc)
    } catch (error) {
        elizaLogger.error(`Buy execution error:`, error);
        return null;
    }
  }

  async sellToken(tokenAddress: string, amountToSell: string): Promise<TradeLog | null> {
    try {
        // Get token info and approve spending
        const tokenAbi = [
            "function approve(address spender, uint256 amount) external returns (bool)",
            "function allowance(address owner, address spender) view returns (uint256)",
        ];
        const token = new ethers.Contract(tokenAddress, tokenAbi, this.wallet);

        // Check if we need to approve
        const currentAllowance = await token.allowance(
            this.wallet.address,
            '0x2626664c2603336E57B271c5C0b26F421741e481'  // SwapRouter02
        );
        
        if (currentAllowance < BigInt(amountToSell)) {
            elizaLogger.log("🔄 Approving token spend...");
            const approveTx = await token.approve(
                '0x2626664c2603336E57B271c5C0b26F421741e481',  // SwapRouter02
                amountToSell
            );
            await approveTx.wait();
            elizaLogger.log("✅ Token approval confirmed");
        }

        // Use same router setup as buy function
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

        // Same params structure as buy, just reversed tokens
        const swapParams = {
            tokenIn: tokenAddress,
            tokenOut: this.WETH_ADDRESS,
            fee: 10000,  // 1% fee tier
            recipient: this.wallet.address,
            amountIn: amountToSell,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        };

        const swapData = router.interface.encodeFunctionData('exactInputSingle', [swapParams]);
        const deadline = Math.floor(Date.now() / 1000) + 300;

        // Execute multicall with same structure as buy
        const tx = await router.multicall(
            deadline,
            [swapData],
            { gasLimit: 500000 }
        );

        elizaLogger.log("📝 Transaction sent:", tx.hash);
        const receipt = await tx.wait();
        elizaLogger.log("✅ Transaction confirmed:", receipt);

        // Use same log parsing as buy
        if (receipt.status === 1) {
            const transferLog = receipt.logs
                .filter(log => log.topics[0] === ethers.id("Transfer(address,address,uint256)"))
                .find(log => log.address.toLowerCase() === this.WETH_ADDRESS.toLowerCase());

            if (transferLog) {
                const amountOut = BigInt(transferLog.data);
                const amountIn = BigInt(amountToSell);
                
                const tradeLog: TradeLog = {
                    tradeId: receipt.hash,
                    tokenAddress,
                    symbol: await this.getTokenSymbol(tokenAddress),
                    action: "SELL",
                    price: Number(amountOut) / Number(amountIn),
                    amount: Number(amountIn),
                    timestamp: new Date().toISOString(),
                };
                return tradeLog;
            }
        }
        return null;
    } catch (error) {
        elizaLogger.error("❌ Trade execution error:", error);
        return null;
    }
  }

  private async getTokenSymbol(tokenAddress: string): Promise<string> {
    const tokenAbi = ["function symbol() view returns (string)"];
    const token = new ethers.Contract(tokenAddress, tokenAbi, this.provider);
    return await token.symbol();
  }
}