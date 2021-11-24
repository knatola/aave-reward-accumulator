export const aaveMumbaiIncentivesContract =
    "0xd41aE58e803Edf4304334acCE4DC4Ec34a63C644";
export const aaveMumbaiProtocolDataProviderContract =
    "0xFA3bD19110d986c5e5E9DD5F69362d05035D045B";
export const aavePolygonIncentivesContract =
    "0x357D51124f59836DeD84c8a1730D72B749d8BC23";
export const aavePolygonDataProviderContract =
    "0x7551b5D2763519d4e37e8B81929D336De671d46d";
// https://polygonscan.com/address/0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf
export const aavePolygonLendingPoolAddress =
    "0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf";
export const quickSwapPolygonFactoryAddress =
    "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32";
export const quickSwapPolygonRouterAddress =
    "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff";

export const POLYGON_CHAIN_ID = 137;

export const getConfig = (): AaveAccumulatorConfiguration => {
    const awardToken = process.env.AWARD_TOKEN || "WMATIC";
    const depositToken = process.env.DEPOSIT_TOKEN || "USDT";
    const networkUrl = process.env.NETWORK_URL;
    if (!networkUrl) {
        throw Error("Missing network url in env file!");
    }
    const walletAddress = process.env.WALLET_ADDRESS;
    if (!walletAddress) {
        throw Error("Missing wallet address in env file!");
    }
    const privateKey = process.env.WALLET_PRIVATE_KEY;
    if (!privateKey) {
        throw Error("Missing wallet private key in env file!");
    }
    const cronPattern = process.env.CRON_PATTERN;
    const createEventLog = process.env.CREATE_EVENT_LOG === "true";

    return {
        incentivesContract: aavePolygonIncentivesContract,
        dataProviderContract: aavePolygonDataProviderContract,
        lendingPoolContractAddress: aavePolygonLendingPoolAddress,
        walletAddress: walletAddress,
        httpsUrl: networkUrl,
        walletPrivateKey: privateKey,
        exchangeFactoryAddress: quickSwapPolygonFactoryAddress,
        exchangeRouterContract: quickSwapPolygonRouterAddress,
        chainId: POLYGON_CHAIN_ID,
        depositToken,
        awardToken,
        cronPattern,
        createEventLog,
    };
};
export type AaveAccumulatorConfiguration = {
    incentivesContract: string;
    dataProviderContract: string;
    lendingPoolContractAddress: string;
    walletAddress: string;
    walletPrivateKey: string;
    httpsUrl: string;
    exchangeFactoryAddress: string;
    exchangeRouterContract: string;
    chainId: number;
    awardToken: string;
    depositToken: string;
    cronPattern: string;
    createEventLog: boolean;
};
