import Web3 from "web3";
import {
    dataProviderABI,
    incentivesABI,
    lendingPoolABI,
} from "./aaveContracts";
import { AaveAccumulatorConfiguration } from "./config";
import { createSignedTransaction } from "./transactions";
import { tokenABI } from "./uniswapContracts";

export type ReserveTokenAdressInfo = {
    aTokenAddress: string;
    stableDebtTokenAddress: string;
    variableDebtTokenAddress: string;
};

export type TokenInfo = {
    symbol: string;
    address: string;
};

export interface AaveDataProvider {
    getReserveTokenAddress: (address: string) => Promise<TokenInfo>;
    getReserveTokensAddresses: (
        address: string
    ) => Promise<ReserveTokenAdressInfo>;
    createRewardsClaimTx: (
        aTokenAddress: string,
        configuration: AaveAccumulatorConfiguration
    ) => Promise<object>;
    createDepositTx: (assetAddress: string, amount: string) => Promise<object>;
    getRewardsBalance: () => Promise<any>;
}

export const createAaveDataProvider = (
    web3: Web3,
    configuration: AaveAccumulatorConfiguration
): AaveDataProvider => {
    const dataProviderContract = new web3.eth.Contract(
        dataProviderABI as any,
        configuration.dataProviderContract
    );

    const incentivesContract = new web3.eth.Contract(
        incentivesABI as any,
        configuration.incentivesContract
    );

    const lendingPoolContract = new web3.eth.Contract(
        lendingPoolABI as any,
        configuration.lendingPoolContractAddress
    );

    const getReserveTokenAddress = async (
        token: string
    ): Promise<TokenInfo> => {
        const result = await dataProviderContract.methods
            .getAllReservesTokens()
            .call({ from: configuration.walletAddress });
        const tokenInfo = result.find((i: any) => i[0] === token);

        return { symbol: tokenInfo.symbol, address: tokenInfo.tokenAddress };
    };

    const getReserveTokensAddresses = async (
        address: string
    ): Promise<ReserveTokenAdressInfo> => {
        const res = await dataProviderContract.methods
            .getReserveTokensAddresses(address)
            .call({ from: configuration.walletAddress });
        return {
            aTokenAddress: res.aTokenAddress,
            stableDebtTokenAddress: res.stableDebtTokenAddress,
            variableDebtTokenAddress: res.variableDebtTokenAddress,
        };
    };

    const createRewardsClaimTx = async (
        aTokenAddress: string,
        configuration: AaveAccumulatorConfiguration
    ): Promise<object> => {
        const rewardsBalance = await incentivesContract.methods
            .getRewardsBalance([aTokenAddress], configuration.walletAddress)
            .call({ from: configuration.walletAddress });

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

        return await createSignedTransaction(
            encodedTxData,
            web3,
            configuration,
            configuration.lendingPoolContractAddress
        );
    };

    const getRewardsBalance = async (): Promise<any> => {
        const awardTokenInfo = await getReserveTokenAddress(
            configuration.awardToken
        );
        const awardTokenContract = new web3.eth.Contract(
            tokenABI as any,
            awardTokenInfo.address
        );
        const rewardsBalance = await awardTokenContract.methods
            .balanceOf(configuration.walletAddress)
            .call({ from: configuration.walletAddress });
        return rewardsBalance;
    };

    return {
        getReserveTokenAddress,
        getReserveTokensAddresses,
        createRewardsClaimTx,
        createDepositTx,
        getRewardsBalance,
    };
};
