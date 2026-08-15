import { afterEach, describe, expect, it } from "vitest";

import { decryptSecretValue, encryptSecretValue, getEncryptionKeyStatus, isEncryptedSecretValue } from "./secret-crypto";

const originalKey = process.env.VOZEB_PRO_ENCRYPTION_KEY;

afterEach(() => {
    if (originalKey === undefined) delete process.env.VOZEB_PRO_ENCRYPTION_KEY;
    else process.env.VOZEB_PRO_ENCRYPTION_KEY = originalKey;
});

describe("secret encryption key", () => {
    it("encrypts and decrypts with a 32-byte hexadecimal key", () => {
        process.env.VOZEB_PRO_ENCRYPTION_KEY = "ab".repeat(32);

        const encrypted = encryptSecretValue("provider-secret");

        expect(isEncryptedSecretValue(encrypted)).toBe(true);
        expect(decryptSecretValue(encrypted)).toBe("provider-secret");
        expect(getEncryptionKeyStatus().ready).toBe(true);
    });

    it("accepts an exact 32-byte base64 key", () => {
        process.env.VOZEB_PRO_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

        expect(getEncryptionKeyStatus().ready).toBe(true);
        expect(decryptSecretValue(encryptSecretValue("secret"))).toBe("secret");
    });

    it("rejects missing, placeholder and passphrase values instead of storing plaintext", () => {
        for (const key of ["", "change-this-random-secret", "replace-with-a-long-random-secret", "ordinary-passphrase"]) {
            process.env.VOZEB_PRO_ENCRYPTION_KEY = key;
            expect(getEncryptionKeyStatus().ready).toBe(false);
            expect(() => encryptSecretValue("provider-secret")).toThrow("不能保存敏感配置");
        }
    });
});
