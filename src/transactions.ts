import axios from "axios";
import Web3 from "web3";
import { pinoConsole } from ".";
import { AaveAccumulatorConfiguration } from "./config";
import { writeTransactionToFile } from "./fileWriter";

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

export const createSignedTransaction = async (
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

    if (
        configuration.gasPriceLimit &&
        gasPriceAsGwei > configuration.gasPriceLimit
    ) {
        throw Error(
            `Standard gas price: ${gasPriceAsGwei} is over configuration limit, skipping transaction!`
        );
    }
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

export const sendSignedTransaction = async (
    signed: any,
    web3: Web3,
    txType: TX_TYPE,
    config: AaveAccumulatorConfiguration
) => {
    pinoConsole.info(
        `Sending signed ${txType} with hash: ${signed.transactionHash}`
    );
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
