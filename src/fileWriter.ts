import { promises as fs } from "fs";
import { TransactionInfo } from "./transactions";
import { AaveAccumulatorConfiguration } from "./config";

const FILE_NAME = "events.csv";

const columnHeaders = ["timestamp", "event_type", "tx_hash"];

export const createCsvFileIfNeeded = async (
    config: AaveAccumulatorConfiguration
): Promise<void> => {
    if (!config.createEventLog) {
        return;
    }
    try {
        await fs.access(FILE_NAME);
        return;
    } catch (e) {
        await fs.writeFile(FILE_NAME, columnHeaders.join(","));
        return;
    }
};

export const writeTransactionToFile = async (
    info: TransactionInfo,
    config: AaveAccumulatorConfiguration
): Promise<void> => {
    if (!config.createEventLog) {
        return;
    }
    const dataString = [info.timestamp, info.type, info.hash].join(",");
    await fs.appendFile(FILE_NAME, "\n" + dataString);
};
