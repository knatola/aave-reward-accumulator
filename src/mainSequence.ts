import Web3 from "web3";
import { pinoConsole } from ".";
import { AaveDataProvider, TokenInfo } from "./aaveData";
import { AaveAccumulatorConfiguration } from "./config";
import { Erc20DataProvider } from "./erc20Data";
import { QuickSwapDataProvider } from "./quickSwapData";
import { sendSignedTransaction, TX_TYPE } from "./transactions";

const MINUTE_IN_MILLIS = 60000;

// Main sequence to accumulate AAVE deposits
export const createMainSequence = (
    web3: Web3,
    configuration: AaveAccumulatorConfiguration
) => {
    return async (
        aaveDataProvider: AaveDataProvider,
        quickSwapDataProvider: QuickSwapDataProvider,
        erc20DataProvider: Erc20DataProvider,
        depositTokenInfo: TokenInfo,
        awardTokenInfo: TokenInfo,
        depositATokenAddress: string
    ): Promise<string> => {
        pinoConsole.info(
            "Starting main sequence, deposit token: %o, award token: %o",
            depositTokenInfo,
            awardTokenInfo
        );
        const awardTokenAddress = awardTokenInfo.address;
        const depositTokenAddress = depositTokenInfo.address;

        const claimTx = await aaveDataProvider.createRewardsClaimTx(
            depositATokenAddress,
            configuration
        );

        await sendSignedTransaction(
            claimTx,
            web3,
            TX_TYPE.CLAIM,
            configuration
        );

        // Calculate needed values for the token swap
        const rewardsTokenBalance = await aaveDataProvider.getRewardsBalance();
        pinoConsole.info(
            "Claimed AAVE incentive rewards, reward token balance after claim: %s %s",
            rewardsTokenBalance,
            awardTokenInfo.symbol
        );

        const amountOut = await quickSwapDataProvider.getSwapAmountOut(
            awardTokenAddress,
            depositTokenAddress,
            rewardsTokenBalance
        );
        pinoConsole.debug(`Amount out for swap: ${amountOut}`);

        const approvalTx = await erc20DataProvider.createApproveErcTx(
            rewardsTokenBalance,
            configuration.exchangeRouterContract,
            awardTokenAddress
        );
        await sendSignedTransaction(
            approvalTx,
            web3,
            TX_TYPE.ERC20_APPROVAL,
            configuration
        );

        const deadline = Date.now() + 5 * MINUTE_IN_MILLIS;
        const swapTx = await quickSwapDataProvider.createSwapTransaction(
            rewardsTokenBalance,
            amountOut.toString(),
            awardTokenAddress,
            depositTokenAddress,
            deadline
        );
        await sendSignedTransaction(swapTx, web3, TX_TYPE.SWAP, configuration);
        pinoConsole.info(
            "Approved erc 20 for swap and performed swap of %s %s for %s %s",
            rewardsTokenBalance,
            awardTokenInfo.symbol,
            amountOut,
            depositTokenInfo.symbol
        );

        const depositTokenBalance = await erc20DataProvider.getBalance(
            depositTokenAddress
        );
        const secondApprovalTx = await erc20DataProvider.createApproveErcTx(
            depositTokenBalance,
            configuration.lendingPoolContractAddress,
            depositTokenAddress
        );
        await sendSignedTransaction(
            secondApprovalTx,
            web3,
            TX_TYPE.ERC20_APPROVAL,
            configuration
        );

        const depositTx = await aaveDataProvider.createDepositTx(
            depositTokenAddress,
            depositTokenBalance
        );
        await sendSignedTransaction(
            depositTx,
            web3,
            TX_TYPE.DEPOSIT,
            configuration
        );

        pinoConsole.info(
            "Deposited %s %s successfully.",
            rewardsTokenBalance,
            awardTokenInfo.symbol
        );
        return depositTokenBalance;
    };
};
