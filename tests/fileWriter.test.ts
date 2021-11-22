import { createCsvFileIfNeeded } from "../src/fileWriter";
import { promises as fs } from "fs";
import { AaveAccumulatorConfiguration } from "../src/config";

const FILE_NAME = "events.csv";

describe("createCsvFileIfNeeded", () => {
    afterEach(async () => {
        try {
            await fs.unlink(FILE_NAME);
        } catch (e) {}
    });

    it("Creates event file if config contains createEvetLog and there is no existing file", async () => {
        const mockConfig = { createEventLog: true };
        await createCsvFileIfNeeded(mockConfig as AaveAccumulatorConfiguration);

        try {
            await fs.access(FILE_NAME);
        } catch (e) {
            fail("Wanted file was not created");
        }
    });

    it("Does not create event file if config has createEventLog as false", async () => {
        const mockConfig = { createEventLog: false };
        await createCsvFileIfNeeded(mockConfig as AaveAccumulatorConfiguration);

        try {
            await fs.access(FILE_NAME);
            fail("File was not supposed to be created!");
        } catch (e) {}
    });
});
