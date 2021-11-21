import "dotenv/config";
import Web3 from "web3";
import {
    exchangeABI,
    factoryABI,
    tokenABI,
    exchangeHelperABI,
} from "./uniswapContracts";
import {
    dataProviderABI,
    incentivesABI,
    lendingPoolABI,
} from "./aaveContracts";
import axios from "axios";
import { AaveAccumulatorConfiguration, getConfig } from "./config";
import cron from "node-cron";
import { pino } from "pino";
import { createCsvFileIfNeeded, writeTransactionToFile } from "./fileWriter";

const MINUTE_IN_MILLIS = 60000;
const MIN_OUT_FIXER_AMOUNT = 1000; // just a little "slippage" to make sure the uniswap trade happens

const singleRun = process.argv[2];
const pinoConsole = pino({
    transport: {
        target: "pino-pretty",
        options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "hostname,pid",
            hideObject: false,
        },
    },
});

export enum TX_TYPE {
    ERC20_APPROVAL = "ERC20_APPROVAL",
    SWAP = "SWAP",
    CLAIM = "CLAIM",
    DEPOSIT = "DEPOSIT",
}
export type TransactionInfo = {
    hash: string;
    timestamp: string;
    type: TX_TYPE;
};

(async () => {
    let configuration: AaveAccumulatorConfiguration;
    try {
        configuration = getConfig();
    } catch (e) {
        pinoConsole.error(e, "Exception in config");
        return;
    }
    const loggableConfig = { ...configuration, walletPrivateKey: "***" };
    pinoConsole.info("Starting Aave reward accumulator...");
    pinoConsole.info(loggableConfig, "Configuration");
    await createCsvFileIfNeeded(configuration);
    const getReserveTokenAddress = async (token: string): Promise<string> => {
        return new Promise((resolve, reject) => {
            dataProviderContract.methods
                .getAllReservesTokens()
                .call({ from: configuration.walletAddress })
                .then((result: any[]) => {
                    const tokenInfo = result.find((i) => i[0] === token);
                    return resolve(tokenInfo.tokenAddress);
                })
                .catch((e: Error) => reject(e));
        });
    };

    // Helper for creating erc 20 token approval tx
    const createApproveErcTransaction = async (
        amount: string,
        who: string,
        erc20Contract: any,
        erc20Address: string
    ): Promise<object> => {
        pinoConsole.info(
            `Creating erc20 tx approval for amount: ${amount}, to who: ${who}, erc20Adress: ${erc20Address}`
        );
        const encodedTxData = erc20Contract.methods
            .approve(who, amount)
            .encodeABI();
        const signedTx = await createSignedTransaction(
            encodedTxData,
            web3,
            configuration,
            erc20Address
        );
        return signedTx;
    };

    // Helper for creating a swap tx
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
        pinoConsole.info(
            `Creating swap tx for inAmount: ${inAmount}, to outAmount: ${outAmount}`
        );
        return await createSignedTransaction(
            encodedTxData,
            web3,
            configuration,
            configuration.exchangeRouterContract
        );
    };

    const createRewardsClaimTx = async (
        aTokenAddress: string,
        configuration: AaveAccumulatorConfiguration
    ): Promise<object> => {
        const rewardsBalance = await incentivesContract.methods
            .getRewardsBalance([aTokenAddress], configuration.walletAddress)
            .call({ from: configuration.walletAddress });
        pinoConsole.info(`Attempting to claim rewards: ${rewardsBalance}`);
        const encodedContractCall = incentivesContract.methods
            .claimRewards(
                [aTokenAddress],
                rewardsBalance,
                configuration.walletAddress
            )
            .encodeABI();
        return await createSignedTransaction(
            encodedContractCall,
            web3,
            configuration,
            configuration.incentivesContract
        );
    };

    const createDepositTx = async (
        assetAddress: string,
        amount: string
    ): Promise<object> => {
        const encodedTxData = lendingPoolContract.methods
            .deposit(assetAddress, amount, configuration.walletAddress, 0)
            .encodeABI();
        pinoConsole.info(
            `Creating deposit tx for amount: ${amount}, to assetAddress: ${assetAddress}`
        );
        return await createSignedTransaction(
            encodedTxData,
            web3,
            configuration,
            configuration.lendingPoolContractAddress
        );
    };

    const getReserveTokensAddresses = async (address: string): Promise<any> => {
        const res = await dataProviderContract.methods
            .getReserveTokensAddresses(address)
            .call({ from: configuration.walletAddress });
        return res;
    };

    const getExchangeAddress = async (
        token1: string,
        token2: string
    ): Promise<any> => {
        const res = await quickSwapFactoryContract.methods
            .getPair(token1, token2)
            .call({ from: configuration.walletAddress });
        return res;
    };

    // Main sequence to accumulate AAVE deposits
    const mainSequence = async (): Promise<string> => {
        // First claim rewards
        const claimTx = await createRewardsClaimTx(
            depositAtokenAddress,
            configuration
        );
        await sendSignedTransaction(
            claimTx,
            web3,
            TX_TYPE.CLAIM,
            configuration
        );

        // Calculate needed values for the token swap
        const quote = await quickSwapRouterContract.methods
            .getAmountsOut(rewardsBalance, [
                awardTokenAddress,
                depositTokenAddress,
            ])
            .call();
        const amountOut = parseInt(quote[1]) - MIN_OUT_FIXER_AMOUNT;
        const deadline = Date.now() + 5 * MINUTE_IN_MILLIS;
        // Create erc20 approval to swap the reward tokens for depositable tokens
        const approvalTx = await createApproveErcTransaction(
            rewardsBalance,
            configuration.exchangeRouterContract,
            awardTokenContract,
            awardTokenAddress
        );
        await sendSignedTransaction(
            approvalTx,
            web3,
            TX_TYPE.ERC20_APPROVAL,
            configuration
        );

        // Make the actual swap
        const swapTx = await createSwapTransaction(
            rewardsBalance,
            amountOut.toString(),
            awardTokenAddress,
            depositTokenAddress,
            deadline
        );
        await sendSignedTransaction(swapTx, web3, TX_TYPE.SWAP, configuration);

        // Create erc20 approval for the deposit
        const rewardsTokenBalance = await depositTokenContract.methods
            .balanceOf(configuration.walletAddress)
            .call({ from: configuration.walletAddress });
        const secondApprovalTx = await createApproveErcTransaction(
            rewardsTokenBalance,
            configuration.lendingPoolContractAddress,
            depositTokenContract,
            depositTokenAddress
        );
        await sendSignedTransaction(
            secondApprovalTx,
            web3,
            TX_TYPE.ERC20_APPROVAL,
            configuration
        );

        // Do deposit
        const depositTx = await createDepositTx(
            depositTokenAddress,
            rewardsTokenBalance
        );
        await sendSignedTransaction(
            depositTx,
            web3,
            TX_TYPE.DEPOSIT,
            configuration
        );
        return rewardsTokenBalance;
    };

    const httpProvider = new Web3.providers.HttpProvider(
        configuration.httpsUrl
    );
    const web3 = new Web3(httpProvider);

    // Contracts
    const incentivesContract = new web3.eth.Contract(
        incentivesABI as any,
        configuration.incentivesContract
    );
    const dataProviderContract = new web3.eth.Contract(
        dataProviderABI as any,
        configuration.dataProviderContract
    );
    const lendingPoolContract = new web3.eth.Contract(
        lendingPoolABI as any,
        configuration.lendingPoolContractAddress
    );
    const quickSwapFactoryContract = new web3.eth.Contract(
        factoryABI as any,
        configuration.exchangeFactoryAddress
    );
    const quickSwapRouterContract = new web3.eth.Contract(
        exchangeHelperABI as any,
        configuration.exchangeRouterContract
    );

    // Addressses
    const awardTokenAddress = await getReserveTokenAddress(
        configuration.awardToken
    );
    const depositTokenAddress = await getReserveTokenAddress(
        configuration.depositToken
    );
    const rewardTokenAddresses = await getReserveTokensAddresses(
        awardTokenAddress
    );
    const depositTokenAddresses = await getReserveTokensAddresses(
        depositTokenAddress
    );
    const rewardAtokenAddress = rewardTokenAddresses.aTokenAddress;
    const depositAtokenAddress = depositTokenAddresses.aTokenAddress;

    const pairExchangeAddress = await getExchangeAddress(
        awardTokenAddress,
        depositTokenAddress
    );
    const quickSwapExchangeContract = new web3.eth.Contract(
        exchangeABI as any,
        pairExchangeAddress
    );
    const awardTokenContract = new web3.eth.Contract(
        tokenABI as any,
        awardTokenAddress
    );
    const depositTokenContract = new web3.eth.Contract(
        tokenABI as any,
        depositTokenAddress
    );
    const rewardsBalance = await awardTokenContract.methods
        .balanceOf(configuration.walletAddress)
        .call({ from: configuration.walletAddress });

    try {
        if (singleRun) {
            pinoConsole.info("Doing a single run");
            return await mainSequence();
        } else {
            pinoConsole.info("Starting cron job");
            cron.schedule(configuration.cronPattern, () => {
                mainSequence().then((rewards) =>
                    pinoConsole.info(`Deposited ${rewards}`)
                );
            });
        }
    } catch (e) {
        pinoConsole.error(
            e,
            "Encountered error in main accumulating sequence:"
        );
    }
})();

// Helper to create signed transactions
const createSignedTransaction = async (
    encodedData: any,
    web3: Web3,
    configuration: AaveAccumulatorConfiguration,
    to: string
): Promise<object> => {
    const nonce = await web3.eth.getTransactionCount(
        configuration.walletAddress
    );
    const gasLimit = 450000;
    const gasPriceJsonRes = await axios.get(
        "https://gasstation-mainnet.matic.network"
    );
    const gasPriceJson = gasPriceJsonRes.data;
    const gasPriceAsGwei = gasPriceJson.standard;
    const gasPrice = web3.utils
        .toWei(gasPriceAsGwei.toString(), "gwei")
        .toString();
    const hexGasLimit = web3.utils.toHex(gasLimit).toString();
    const hexGasPrice = web3.utils.toHex(parseInt(gasPrice).toString());

    const rawTax = {
        nonce: nonce,
        from: configuration.walletAddress,
        to,
        gasPrice: hexGasPrice,
        gasLimit: hexGasLimit,
        value: "0x00",
        data: encodedData,
        chainId: configuration.chainId,
    };
    const signed = await web3.eth.accounts.signTransaction(
        rawTax,
        configuration.walletPrivateKey
    );
    return signed;
};

const sendSignedTransaction = async (
    signed: any,
    web3: Web3,
    txType: TX_TYPE,
    config: AaveAccumulatorConfiguration
) => {
    pinoConsole.info(`Sending signed transaction: ${signed.transactionHash}`);
    let transactionPending = true;
    web3.eth.sendSignedTransaction(signed.rawTransaction).on("error", (e) => {
        pinoConsole.error(
            e,
            `Transaction failed type: ${txType}, hash: ${signed.transactionHash}`
        );
        transactionPending = false;
    });

    while (transactionPending) {
        pinoConsole.info(
            "Fetching transaction receipt, this might take some time..."
        );
        const receipt = await web3.eth.getTransactionReceipt(
            signed.transactionHash
        );
        if (receipt == null) {
            await new Promise((resolve) => setTimeout(resolve, 15000));
        } else {
            pinoConsole.info(
                `Transaction done, receipt txHash:
                ${receipt.transactionHash}`
            );
            const now = new Date();
            const txInfo = {
                timestamp: now.toISOString(),
                type: txType,
                hash: signed.transactionHash,
            };
            await writeTransactionToFile(txInfo, config);
            transactionPending = false;
        }
    }
};

process.on("SIGTERM", () => {
    pinoConsole.info("Shutting down...");
});
