import Web3 from "web3";
import { AaveAccumulatorConfiguration } from "./config";
import { createSignedTransaction } from "./transactions";
import { tokenABI } from "./uniswapContracts";

export interface Erc20DataProvider {
    getBalance: (erc20Address: string) => Promise<any>;
    createApproveErcTx: (
        amount: string,
        who: string,
        erc20Address: string
    ) => Promise<object>;
}

export const createErc20DataProvider = (
    web3: Web3,
    configuration: AaveAccumulatorConfiguration
) => {
    const getBalance = async (erc20Address: string): Promise<any> => {
        const erc20Contract = new web3.eth.Contract(
            tokenABI as any,
            erc20Address
        );
        const balance = await erc20Contract.methods
            .balanceOf(configuration.walletAddress)
            .call({ from: configuration.walletAddress });

        return balance;
    };

    const createApproveErcTx = async (
        amount: string,
        who: string,
        erc20Address: string
    ): Promise<object> => {
        const erc20Contract = new web3.eth.Contract(
            tokenABI as any,
            erc20Address
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

    return {
        getBalance,
        createApproveErcTx,
    };
};
