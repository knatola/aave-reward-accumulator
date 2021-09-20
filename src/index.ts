import 'dotenv/config'
import Web3 from 'web3'
import { exchangeABI, factoryABI, tokenABI, exchangeHelperABI } from "./uniswapContracts"
import { dataProviderABI, incentivesABI, lendingPoolABI } from "./aaveContracts"
import axios from "axios";
import { AaveAccumulatorConfiguration, getConfig } from './config';
import cron from "node-cron";

const MINUTE_IN_MILLIS = 60000;
const MIN_OUT_FIXER_AMOUNT = 1000; // just a little "slippage" to make sure the uniswap trade happens

const singleRun = process.argv[2];

(async () => {
    let configuration: AaveAccumulatorConfiguration;
    try {
        configuration = getConfig();
    } catch (e) {
        console.error("Exception in config:", e);
        return;
    }
    const loggableConfig = { ...configuration, walletPrivateKey: "***" };
    console.log('Starting Aave reward accumulator...');
    console.log("configuration: ", loggableConfig);
    const getReserveTokenAddress = async (token: string): Promise<string> => {
        return new Promise((resolve, reject) => {
            dataProviderContract.methods.getAllReservesTokens()
                .call({ from: configuration.walletAddress })
                .then((result: any[]) => {
                    const tokenInfo = result.find(i => i[0] === token)
                    return resolve(tokenInfo.tokenAddress)
                })
                .catch((e: Error) => reject(e))
        })
    }

    // Helper for creating erc 20 token approval tx
    const createApproveErcTransaction = async (amount: string, who: string, erc20Contract: any, erc20Address: string): Promise<object> => {
        console.log(`Creating erc20 tx approval for amount: ${amount}, to who: ${who}, erc20Adress: ${erc20Address}`);
        const encodedTxData = erc20Contract.methods.approve(who, amount).encodeABI();
        const signedTx = await createSignedTransaction(encodedTxData, web3, configuration, erc20Address);
        return signedTx;
    }

    // Helper for creating a swap tx
    const createSwapTransaction = async (inAmount: string, outAmount: string, addr1: string, addr2: string, deadline: number): Promise<object> => {
        const encodedTxData = quickSwapRouterContract.methods
            .swapExactTokensForTokens(inAmount, outAmount, [addr1, addr2], configuration.walletAddress, deadline).encodeABI();
        console.log(`Creating swap tx for inAmount: ${inAmount}, to outAmount: ${outAmount}`);
        return await createSignedTransaction(encodedTxData, web3, configuration, configuration.exchangeRouterContract);
    }

    const createRewardsClaimTx = async (aTokenAddress: string, configuration: AaveAccumulatorConfiguration): Promise<object> => {
        const rewardsBalance = await incentivesContract.methods.getRewardsBalance([aTokenAddress], configuration.walletAddress).call({ from: configuration.walletAddress });
        console.log("Attempting to claim:", rewardsBalance);
        const encodedContractCall = incentivesContract.methods.claimRewards([aTokenAddress], rewardsBalance, configuration.walletAddress).encodeABI();
        return await createSignedTransaction(encodedContractCall, web3, configuration, configuration.incentivesContract);
    }

    const createDepositTx = async (assetAddress: string, amount: string): Promise<object> => {
        const encodedTxData = lendingPoolContract.methods.deposit(assetAddress, amount, configuration.walletAddress, 0)
            .encodeABI();
        console.log(`Creating deposit tx for amount: ${amount}, to assetAddress: ${assetAddress}`);
        return await createSignedTransaction(encodedTxData, web3, configuration, configuration.lendingPoolContractAddress);
    }

    const getReserveTokensAddresses = async (address: string): Promise<any> => {
        const res = await dataProviderContract.methods.getReserveTokensAddresses(address)
            .call({ from: configuration.walletAddress });
        return res;
    }

    const getExchangeAddress = async (token1: string, token2: string): Promise<any> => {
        const res = await quickSwapFactoryContract.methods.getPair(token1, token2).call({ from: configuration.walletAddress });
        return res;
    }

    const mainSequence = async (): Promise<string> => {
        // Main sequence to accumulate AAVE deposits
        // First claim rewards
        const claimTx = await createRewardsClaimTx(depositAtokenAddress, configuration);
        await sendSignedTransaction(claimTx, web3);

        // Calculate needed values for the token swap
        const quote = await quickSwapRouterContract.methods.getAmountsOut(rewardsBalance, [awardTokenAddress, depositTokenAddress]).call();
        const amountOut = parseInt(quote[1]) - MIN_OUT_FIXER_AMOUNT;
        const deadline = Date.now() + 5 * MINUTE_IN_MILLIS;
        // Create erc20 approval to swap the reward tokens for depositable tokens
        const approvalTx = await createApproveErcTransaction(rewardsBalance, configuration.exchangeRouterContract, awardTokenContract, awardTokenAddress);
        await sendSignedTransaction(approvalTx, web3);

        // Make the actual swap 
        const swapTx = await createSwapTransaction(rewardsBalance, amountOut.toString(), awardTokenAddress, depositTokenAddress, deadline);
        await sendSignedTransaction(swapTx, web3);

        // Create erc20 approval for the deposit
        const rewardsTokenBalance = await depositTokenContract.methods.balanceOf(configuration.walletAddress).call({ from: configuration.walletAddress });
        const secondApprovalTx = await createApproveErcTransaction(rewardsTokenBalance, configuration.lendingPoolContractAddress, depositTokenContract, depositTokenAddress);
        await sendSignedTransaction(secondApprovalTx, web3);

        // Do deposit
        const depositTx = await createDepositTx(depositTokenAddress, rewardsTokenBalance);
        await sendSignedTransaction(depositTx, web3);
        return rewardsTokenBalance;

    }

    const httpProvider = new Web3.providers.HttpProvider(configuration.httpsUrl);
    const web3 = new Web3(httpProvider);

    // Contracts
    const incentivesContract = new web3.eth.Contract(incentivesABI as any, configuration.incentivesContract);
    const dataProviderContract = new web3.eth.Contract(dataProviderABI as any, configuration.dataProviderContract);
    const lendingPoolContract = new web3.eth.Contract(lendingPoolABI as any, configuration.lendingPoolContractAddress);
    const quickSwapFactoryContract = new web3.eth.Contract(factoryABI as any, configuration.exchangeFactoryAddress);
    const quickSwapRouterContract = new web3.eth.Contract(exchangeHelperABI as any, configuration.exchangeRouterContract);

    // Addressses
    const awardTokenAddress = await getReserveTokenAddress(configuration.awardToken);
    const depositTokenAddress = await getReserveTokenAddress(configuration.depositToken);
    const rewardTokenAddresses = await getReserveTokensAddresses(awardTokenAddress);
    const depositTokenAddresses = await getReserveTokensAddresses(depositTokenAddress);
    const rewardAtokenAddress = rewardTokenAddresses.aTokenAddress;
    const depositAtokenAddress = depositTokenAddresses.aTokenAddress;

    const pairExchangeAddress = await getExchangeAddress(awardTokenAddress, depositTokenAddress);
    const quickSwapExchangeContract = new web3.eth.Contract(exchangeABI as any, pairExchangeAddress);
    const awardTokenContract = new web3.eth.Contract(tokenABI as any, awardTokenAddress);
    const depositTokenContract = new web3.eth.Contract(tokenABI as any, depositTokenAddress);
    const rewardsBalance = await awardTokenContract.methods.balanceOf(configuration.walletAddress).call({ from: configuration.walletAddress });

    try {
        if (singleRun) {
            console.log("Doing a single run");
            return await mainSequence();
        } else {
            console.log("Starting cron job");
            cron.schedule(configuration.cronPattern, () => {
                mainSequence().then(rewards => console.log(`Deposited ${rewards}`));
            });
        }
    } catch (e) {
        console.error("Encountered error in main accumulating sequence:", e);
    }
})()

// Helper to create signed transactions
const createSignedTransaction = async (encodedData: any, web3: Web3, configuration: AaveAccumulatorConfiguration, to: string): Promise<object> => {
    const nonce = await web3.eth.getTransactionCount(configuration.walletAddress);
    const gasLimit = 450000;
    const gasPriceJsonRes = await axios.get("https://gasstation-mainnet.matic.network");
    const gasPriceJson = gasPriceJsonRes.data;
    const gasPriceAsGwei = gasPriceJson.standard;
    const gasPrice = web3.utils.toWei(gasPriceAsGwei.toString(), "gwei").toString();
    const hexGasLimit = web3.utils.toHex(gasLimit).toString();
    const hexGasPrice = web3.utils.toHex((parseInt(gasPrice)).toString());

    const rawTax = {
        nonce: nonce,
        from: configuration.walletAddress,
        to,
        gasPrice: hexGasPrice,
        gasLimit: hexGasLimit,
        value: "0x00",
        data: encodedData,
        chainId: configuration.chainId,
    }
    const signed = await web3.eth.accounts.signTransaction(rawTax, configuration.walletPrivateKey);
    return signed;
}

const sendSignedTransaction = async (signed: any, web3: Web3) => {
    console.log("Sending signed transaction:", signed.transactionHash);
    web3.eth.sendSignedTransaction(signed.rawTransaction)
        .on("error", (e) => console.error("Transaction failed:", e));
    let transactionPending = true;
    while (transactionPending) {
        console.log("fetching transaction receipt...");
        const receipt = await web3.eth.getTransactionReceipt(signed.transactionHash);
        if (receipt == null) {
            console.log("Transaction pending, sleeping and retrying to get receipt...");
            await new Promise(resolve => setTimeout(resolve, 15000));
        } else {
            console.log("Transaction done, receipt txHash:", receipt.transactionHash);
            transactionPending = false;
        }
    }
}

process.on('SIGTERM', () => {
    console.info('Shutting down...')
})
