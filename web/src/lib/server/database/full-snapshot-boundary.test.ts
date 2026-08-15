import { afterEach, describe, expect, it } from "vitest";

import { readAuthDb } from "@/lib/auth/store-repository";
import { readPromptBackup } from "@/lib/prompts/store";
import { readGenerationLogDb } from "@/lib/server/generation-log-repository";

const originalProvider = process.env.VOZEB_PRO_DATABASE_PROVIDER;

afterEach(() => {
    if (originalProvider === undefined) delete process.env.VOZEB_PRO_DATABASE_PROVIDER;
    else process.env.VOZEB_PRO_DATABASE_PROVIDER = originalProvider;
});

describe("PostgreSQL full snapshot boundaries", () => {
    it("rejects ordinary full-snapshot readers", async () => {
        process.env.VOZEB_PRO_DATABASE_PROVIDER = "postgres";

        await expect(readAuthDb()).rejects.toThrow("entity repositories");
        await expect(readPromptBackup()).rejects.toThrow("scoped repositories");
        await expect(readGenerationLogDb()).rejects.toThrow("scoped repositories");
    });
});
