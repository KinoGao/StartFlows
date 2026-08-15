import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    readJsonDataFile: vi.fn(),
    writeJsonDataFile: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
    createPostgresRepositories: vi.fn(),
    ensurePostgresSchema: vi.fn(),
    getPostgresConnectionString: vi.fn(() => ""),
    isPostgresDatabaseEnabled: vi.fn(() => false),
}));
vi.mock("@/lib/server/data-adapter", () => ({
    readJsonDataFile: mocks.readJsonDataFile,
    writeJsonDataFile: mocks.writeJsonDataFile,
}));
vi.mock("@/lib/server/secret-crypto", () => ({
    decryptSecretValue: (value: string) => value,
    encryptSecretValue: (value: string) => value,
}));

import { savePaymentProviderConfig } from "./payment-config-store";

describe("payment provider config save", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.readJsonDataFile.mockResolvedValue({ providers: {} });
        mocks.writeJsonDataFile.mockResolvedValue(undefined);
    });

    it("rejects an Alipay mode outside the mutually exclusive selector", async () => {
        await expect(savePaymentProviderConfig({ providerId: "alipay", enabled: true, values: { mode: "both" } })).rejects.toMatchObject({ message: "接入方式配置无效", status: 400 });
        expect(mocks.writeJsonDataFile).not.toHaveBeenCalled();
    });

    it("persists face-to-face as the single Alipay mode", async () => {
        await savePaymentProviderConfig({ providerId: "alipay", enabled: true, values: { mode: "face_to_face" } });

        expect(mocks.writeJsonDataFile).toHaveBeenCalledWith(
            "payment-config.json",
            expect.objectContaining({
                providers: expect.objectContaining({
                    alipay: expect.objectContaining({ enabled: true, values: expect.objectContaining({ mode: "face_to_face" }) }),
                }),
            }),
        );
    });

    it("preserves the enabled state when a partial config save omits it", async () => {
        mocks.readJsonDataFile.mockResolvedValue({ providers: { alipay: { enabled: true, values: { mode: "official", appId: "saved-app" } } } });

        await savePaymentProviderConfig({ providerId: "alipay", values: { mode: "face_to_face" } });

        expect(mocks.writeJsonDataFile).toHaveBeenCalledWith(
            "payment-config.json",
            expect.objectContaining({ providers: expect.objectContaining({ alipay: expect.objectContaining({ enabled: true, values: expect.objectContaining({ mode: "face_to_face", appId: "saved-app" }) }) }) }),
        );
    });
});
