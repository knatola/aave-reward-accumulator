import Web3 from "web3";
import { pinoConsole } from ".";
import { AaveAccumulatorConfiguration } from "./config";
import { createSignedTransaction } from "./transactions";
import { exchangeHelperABI, factoryABI, tokenABI } from "./uniswapContracts";

const MIN_OUT_FIXER_AMOUNT = 1000; // just a little "slippage" to make sure the uniswap trade happens

export interface QuickSwapDataProvider {
    getExchangeAddress: (token1: string, token2: string) => Promise<string>;
    createSwapTransaction: (
        inAmount: string,
        outAmount: string,
        addr1: string,
        addr2: string,
        deadline: number
    ) => Promise<object>;
    getSwapAmountOut: (
        awardTokenAddress: string,
        depositTokenAddress: string,
        rewardsBalance: any
    ) => Promise<number>;
}

export const createQuickSwapDataProvider = (
    web3: Web3,
    configuration: AaveAccumulatorConfiguration
): QuickSwapDataProvider => {
    const quickSwapFactoryContract = new web3.eth.Contract(
        factoryABI as any,
        configuration.exchangeFactoryAddress
    );

    const quickSwapRouterContract = new web3.eth.Contract(
        exchangeHelperABI as any,
        configuration.exchangeRouterContract
    );

    const getExchangeAddress = async (
        token1: string,
        token2: string
    ): Promise<string> => {
        const res = await quickSwapFactoryContract.methods
            .getPair(token1, token2)
            .call({ from: configuration.walletAddress });
        return res;
    };

    const createSwapTransaction = async (
        inAmount: string,
        outAmount: string,
        addr1: string,
        addr2: string,
        deadline: number
    ): Promise<object> => {
        const encodedTxData = quickSwapRouterContract.methods
            .swapExactTokensForTokens(
                inAmount,
                outAmount,
                [addr1, addr2],
                configuration.walletAddress,
                deadline
            )
            .encodeABI();

        return await createSignedTransaction(
            encodedTxData,
            web3,
            configuration,
            configuration.exchangeRouterContract
        );
    };

    const getSwapAmountOut = async (
        awardTokenAddress: string,
        depositTokenAddress: string,
        rewardsBalance: any
    ): Promise<number> => {
        pinoConsole.debug(
            `Calculating swap amount out for rewards balance: ${rewardsBalance}`
        );
        const quote = await quickSwapRouterContract.methods
            .getAmountsOut(rewardsBalance, [
                awardTokenAddress,
                depositTokenAddress,
            ])
            .call();

        const amountOut = parseInt(quote[1]) - MIN_OUT_FIXER_AMOUNT;
        return amountOut;
    };

    return {
        getExchangeAddress,
        createSwapTransaction,
        getSwapAmountOut,
    };
};
