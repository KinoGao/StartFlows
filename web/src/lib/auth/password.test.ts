import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword, verifyPasswordWithDummy } from "./password";

describe("password hashing", () => {
    it("round-trips the current PBKDF2 format asynchronously", async () => {
        const storedHash = await hashPassword("correct horse battery staple");

        await expect(verifyPassword("correct horse battery staple", storedHash)).resolves.toBe(true);
        await expect(verifyPassword("wrong password", storedHash)).resolves.toBe(false);
    });

    it("rejects malformed or excessive work-factor hashes", async () => {
        await expect(verifyPassword("secret", "not-a-password-hash")).resolves.toBe(false);
        await expect(verifyPassword("secret", "pbkdf2_sha256$1000001$salt$hash")).resolves.toBe(false);
    });

    it("executes the dummy verification path without authenticating an unknown user", async () => {
        await expect(verifyPasswordWithDummy("secret")).resolves.toBe(false);
    });
});
