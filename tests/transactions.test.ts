import { createSignedTransaction } from "../src/transactions";
import { AaveAccumulatorConfiguration } from "../src/config";
import axios from "axios";

jest.mock("axios");

describe("createSignedTransaction", () => {
    const mockGetTransactionCount = jest.fn();
    const mockSignTransaction = jest.fn();
    const mockToWei = jest.fn().mockImplementation((s) => s);
    const mockToHex = jest.fn().mockImplementation(() => 1);

    const mockWeb3 = {
        eth: {
            getTransactionCount: mockGetTransactionCount,
            accounts: { signTransaction: mockSignTransaction },
        },
        utils: { toWei: mockToWei, toHex: mockToHex },
    };
    it("Throws an error when standard gas price is over configured limit", async () => {
        // Mock basis for test
        const mockGasApiResponse = { data: { standard: 101 } };
        const mockConfig = { gasPriceLimit: 100 };
        (axios as any).get.mockResolvedValueOnce(mockGasApiResponse);

        // Act
        try {
            await createSignedTransaction(
                {},
                mockWeb3 as any,
                mockConfig as AaveAccumulatorConfiguration,
                ""
            );
            fail("Expected error was not thrown!");
        } catch (e) {
            // Assert wanted error was thrown
            expect(e.message).toEqual(
                "Standard gas price: 101 is over configuration limit, skipping transaction!"
            );
            expect(mockToWei).toHaveBeenCalledTimes(0);
        }
    });

    it("Does not throw an error when standard gas price is over configured limit", async () => {
        // Mock basis
        const mockGasApiResponse = { data: { standard: 99 } };
        const mockConfig = { gasPriceLimit: undefined };
        (axios as any).get.mockResolvedValueOnce(mockGasApiResponse);

        // Act
        const signedTransaction = await createSignedTransaction(
            {},
            mockWeb3 as any,
            mockConfig as AaveAccumulatorConfiguration,
            ""
        );

        // Assert wanted interactions happened
        expect(mockToWei).toHaveBeenCalledTimes(1);
        expect(mockToWei).toHaveBeenCalledWith("99", "gwei");
        expect(mockToHex).toHaveBeenCalledTimes(2);
        expect(mockSignTransaction).toHaveBeenCalledTimes(1);
    });
});
