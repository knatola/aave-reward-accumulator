import "dotenv/config";
import Web3 from "web3";
import { AaveAccumulatorConfiguration, getConfig } from "./config";
import cron from "node-cron";
import { pino } from "pino";
import { createCsvFileIfNeeded } from "./fileWriter";
import { createAaveDataProvider } from "./aaveData";
import { createQuickSwapDataProvider } from "./quickSwapData";
import { createErc20DataProvider } from "./erc20Data";
import { createMainSequence } from "./mainSequence";

const singleRun = process.argv[2];

export const pinoConsole = pino({
    transport: {
        target: "pino-pretty",
        options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "hostname,pid",
            hideObject: false,
        },
    },
    level: process.env.NODE_ENV === "development" ? "debug" : "info",
});

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

    const httpProvider = new Web3.providers.HttpProvider(
        configuration.httpsUrl
    );
    const web3 = new Web3(httpProvider);

    const aaveDataProvider = createAaveDataProvider(web3, configuration);
    const erc20DataProvider = createErc20DataProvider(web3, configuration);
    const quickSwapDataProvider = createQuickSwapDataProvider(
        web3,
        configuration
    );

    const tokenAddressAward = await aaveDataProvider.getReserveTokenAddress(
        configuration.awardToken
    );
    const tokenAddressDeposit = await aaveDataProvider.getReserveTokenAddress(
        configuration.depositToken
    );
    const depositTokenAddresses =
        await aaveDataProvider.getReserveTokensAddresses(
            tokenAddressDeposit.address
        );
    const depositAtokenAddress = depositTokenAddresses.aTokenAddress;
    const mainSequence = createMainSequence(web3, configuration);

    if (singleRun) {
        try {
            pinoConsole.info("Doing a single run");
            return await mainSequence(
                aaveDataProvider,
                quickSwapDataProvider,
                erc20DataProvider,
                tokenAddressDeposit,
                tokenAddressAward,
                depositAtokenAddress
            );
        } catch (e) {
            pinoConsole.error(
                e,
                "Encountered error in main accumulating sequence:"
            );
        }
    } else {
        pinoConsole.info("Starting cron job");
        cron.schedule(configuration.cronPattern, async () => {
            try {
                await mainSequence(
                    aaveDataProvider,
                    quickSwapDataProvider,
                    erc20DataProvider,
                    tokenAddressDeposit,
                    tokenAddressAward,
                    depositAtokenAddress
                );
            } catch (e) {
                pinoConsole.error(
                    e,
                    "Encountered error in main accumulating sequence:"
                );
            }
        });
    }
})();

process.on("SIGTERM", () => {
    pinoConsole.info("Shutting down...");
});
