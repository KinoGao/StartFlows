import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const script = fileURLToPath(new URL("./reset-admin-mfa.mjs", import.meta.url));

describe("reset-admin-mfa file provider", () => {
    it("clears the selected administrator MFA, revokes their sessions, and preserves a recovery copy", async () => {
        const dataDir = await mkdtemp(path.join(os.tmpdir(), "vozeb-pro-mfa-reset-"));
        const authFile = path.join(dataDir, "auth.json");
        const original = {
            users: [
                {
                    id: "admin-one",
                    username: "admin",
                    role: "admin",
                    status: "active",
                    mfaSecretCiphertext: "encrypted-secret",
                    mfaEnabledAt: "2026-08-09T00:00:00.000Z",
                    updatedAt: "2026-08-09T00:00:00.000Z",
                },
                { id: "user-one", username: "user", role: "user", status: "active" },
            ],
            sessions: [
                { id: "admin-session", userId: "admin-one" },
                { id: "user-session", userId: "user-one" },
            ],
        };
        await writeFile(authFile, JSON.stringify(original), "utf8");

        const result = await run(process.execPath, [script, "--data-dir", dataDir, "--username", "admin"], {
            env: { ...process.env, VOZEB_PRO_DATABASE_PROVIDER: "file" },
        });

        expect(result.stdout).toContain("管理员 MFA 已重置：admin");
        const restored = JSON.parse(await readFile(authFile, "utf8"));
        expect(restored.users[0]).not.toHaveProperty("mfaSecretCiphertext");
        expect(restored.users[0]).not.toHaveProperty("mfaEnabledAt");
        expect(restored.sessions).toEqual([{ id: "user-session", userId: "user-one" }]);

        const backupDir = path.join(dataDir, "restore-backups");
        const backups = await readdir(backupDir);
        expect(backups).toHaveLength(1);
        expect(backups[0]).toMatch(/^auth-mfa-reset-.+\.json$/);
        expect(JSON.parse(await readFile(path.join(backupDir, backups[0]), "utf8"))).toEqual(original);
    });
});
