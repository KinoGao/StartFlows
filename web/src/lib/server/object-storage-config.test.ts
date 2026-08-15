import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    read: vi.fn(),
    write: vi.fn(),
    encrypt: vi.fn((value: string) => `encrypted:${value}`),
    decrypt: vi.fn((value: string) => value.replace(/^encrypted:/, "")),
}));

vi.mock("@/lib/server/database/object-storage-repository", () => ({
    readObjectStorageSettings: mocks.read,
    writeObjectStorageSettings: mocks.write,
}));
vi.mock("@/lib/server/secret-crypto", () => ({
    encryptSecretValue: mocks.encrypt,
    decryptSecretValue: mocks.decrypt,
}));

import { getObjectStorageAdminSettings, getObjectStorageRuntimeConfig, saveObjectStorageAdminSettings } from "./object-storage-config";

const storedSettings = {
    id: "default" as const,
    enabled: false,
    endpoint: "https://oss.example.com",
    region: "cn-test-1",
    bucket: "media",
    prefix: "vozeb-pro",
    accessKeyIdCiphertext: "encrypted:old-access",
    secretAccessKeyCiphertext: "encrypted:old-secret",
    forcePathStyle: false,
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
};

describe("object storage configuration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.read.mockResolvedValue(storedSettings);
        mocks.write.mockImplementation(async (value) => value);
    });

    it("redacts stored credentials from administrator settings", async () => {
        const settings = await getObjectStorageAdminSettings();

        expect(settings).toMatchObject({ hasAccessKeyId: true, hasSecretAccessKey: true });
        expect(JSON.stringify(settings)).not.toContain("old-access");
        expect(JSON.stringify(settings)).not.toContain("old-secret");
    });

    it("preserves encrypted credentials when secret fields are empty", async () => {
        await saveObjectStorageAdminSettings({
            enabled: true,
            endpoint: "https://oss.example.com/",
            region: "cn-test-1",
            bucket: "media",
            prefix: "/tenant/assets/",
            forcePathStyle: true,
            accessKeyId: "",
            secretAccessKey: "",
        });

        expect(mocks.write).toHaveBeenCalledWith(
            expect.objectContaining({
                enabled: true,
                endpoint: "https://oss.example.com",
                prefix: "tenant/assets",
                accessKeyIdCiphertext: "encrypted:old-access",
                secretAccessKeyCiphertext: "encrypted:old-secret",
            }),
        );
        expect(mocks.encrypt).not.toHaveBeenCalled();
    });

    it("rejects unsafe endpoints and incomplete enabled configurations", async () => {
        await expect(saveObjectStorageAdminSettings({ enabled: false, endpoint: "ftp://oss.example.com", region: "auto", bucket: "media", prefix: "vozeb-pro", forcePathStyle: false })).rejects.toThrow("Endpoint");
        mocks.read.mockResolvedValue({ ...storedSettings, accessKeyIdCiphertext: "", secretAccessKeyCiphertext: "" });
        await expect(saveObjectStorageAdminSettings({ enabled: true, endpoint: "", region: "auto", bucket: "media", prefix: "vozeb-pro", forcePathStyle: false })).rejects.toThrow("Access Key");
    });

    it("does not let an old in-flight read overwrite the cache after a switch change", async () => {
        let resolveOld!: (value: typeof storedSettings) => void;
        mocks.read.mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve))).mockResolvedValue({ ...storedSettings, enabled: true });
        const oldRead = getObjectStorageRuntimeConfig();
        await Promise.resolve();

        await saveObjectStorageAdminSettings({
            enabled: true,
            endpoint: storedSettings.endpoint,
            region: storedSettings.region,
            bucket: storedSettings.bucket,
            prefix: storedSettings.prefix,
            forcePathStyle: false,
        });
        resolveOld(storedSettings);
        await oldRead;

        await expect(getObjectStorageRuntimeConfig()).resolves.toMatchObject({ enabled: true });
        expect(mocks.read).toHaveBeenCalledTimes(4);
    });
});
