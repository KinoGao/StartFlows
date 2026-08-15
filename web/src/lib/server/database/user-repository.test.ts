import { describe, expect, it, vi } from "vitest";

import type { QueryExecutor } from "./postgres";
import { EmailCodesRepository, SessionsRepository, UsersRepository } from "./user-repository";

describe("UsersRepository security fields", () => {
    it("persists and returns the accepted policy snapshot with a new account id", async () => {
        const acceptedAt = "2026-08-09T08:30:00.000Z";
        const query = vi.fn(async (_statement: string, _values?: unknown[]) => ({
            rows: [
                {
                    id: "user-one",
                    account_id: 1,
                    username: "new-user",
                    display_name: "新用户",
                    bio: "",
                    role: "user",
                    status: "active",
                    plan_id: "free",
                    points_balance: 0,
                    password_hash: "hash",
                    terms_version: "2.0",
                    terms_url: "/terms",
                    privacy_version: "3.0",
                    privacy_url: "/privacy",
                    policy_accepted_at: acceptedAt,
                    created_at: acceptedAt,
                    updated_at: acceptedAt,
                },
            ],
            rowCount: 1,
        }));
        const repository = new UsersRepository({ query } as unknown as QueryExecutor);

        const user = await repository.createWithNextAccountId({
            id: "user-one",
            username: "new-user",
            displayName: "新用户",
            bio: "",
            role: "user",
            adminPermissions: [],
            status: "active",
            planId: "free",
            pointsBalance: 0,
            passwordHash: "hash",
            registrationConsent: { termsVersion: "2.0", termsUrl: "/terms", privacyVersion: "3.0", privacyUrl: "/privacy", acceptedAt },
            createdAt: acceptedAt,
            updatedAt: acceptedAt,
        });

        const [statement, values] = query.mock.calls[0];
        expect(statement).toContain("terms_version, terms_url, privacy_version, privacy_url, policy_accepted_at");
        expect(values?.slice(14, 19)).toEqual(["2.0", "/terms", "3.0", "/privacy", acceptedAt]);
        expect(user.registrationConsent).toEqual({ termsVersion: "2.0", termsUrl: "/terms", privacyVersion: "3.0", privacyUrl: "/privacy", acceptedAt });
    });

    it("persists MFA fields and can explicitly clear both values", async () => {
        const query = vi.fn(async (_statement: string, _values?: unknown[]) => ({
            rows: [
                {
                    id: "admin-one",
                    account_id: 1,
                    username: "admin",
                    display_name: "管理员",
                    bio: "",
                    role: "admin",
                    status: "active",
                    plan_id: "free",
                    points_balance: 0,
                    password_hash: "hash",
                    created_at: "2026-08-09T00:00:00.000Z",
                    updated_at: "2026-08-09T00:00:00.000Z",
                },
            ],
            rowCount: 1,
        }));
        const repository = new UsersRepository({ query } as unknown as QueryExecutor);

        await repository.create({
            id: "admin-one",
            accountId: "0001",
            username: "admin",
            displayName: "管理员",
            bio: "",
            role: "admin",
            adminPermissions: ["administrators.manage"],
            status: "active",
            planId: "free",
            pointsBalance: 0,
            passwordHash: "hash",
            mfaSecretCiphertext: "encrypted-secret",
            mfaEnabledAt: "2026-08-09T01:00:00.000Z",
            createdAt: "2026-08-09T00:00:00.000Z",
            updatedAt: "2026-08-09T00:00:00.000Z",
        });
        await repository.update("admin-one", { mfaSecretCiphertext: null, mfaEnabledAt: null });

        expect(query.mock.calls[0][0]).toContain("mfa_secret_ciphertext, mfa_enabled_at");
        expect(query.mock.calls[0][1]?.slice(13, 15)).toEqual(["encrypted-secret", "2026-08-09T01:00:00.000Z"]);
        expect(query.mock.calls[1][0]).toContain("mfa_secret_ciphertext = CASE WHEN $17::boolean");
        expect(query.mock.calls[1][1]?.slice(16)).toEqual([true, null, true, null]);
    });
});

describe("technical expiry repositories", () => {
    it("deletes expired sessions through a stable bounded candidate query", async () => {
        const query = vi.fn(async (_statement: string, _values?: unknown[]) => ({ rows: [], rowCount: 2 }));
        const now = new Date("2026-08-09T12:00:00.000Z");

        await expect(new SessionsRepository({ query } as unknown as QueryExecutor).pruneExpired(now, 30)).resolves.toBe(2);

        expect(query.mock.calls[0][0]).toContain("ORDER BY expires_at ASC, id ASC");
        expect(query.mock.calls[0][0]).toContain("LIMIT $2");
        expect(query.mock.calls[0][1]).toEqual([now.toISOString(), 30]);
    });

    it("deletes expired or consumed email codes through a stable bounded candidate query", async () => {
        const query = vi.fn(async (_statement: string, _values?: unknown[]) => ({ rows: [], rowCount: 3 }));
        const now = new Date("2026-08-09T12:00:00.000Z");

        await expect(new EmailCodesRepository({ query } as unknown as QueryExecutor).pruneExpired(now, 40)).resolves.toBe(3);

        expect(query.mock.calls[0][0]).toContain("expires_at <= $1 OR consumed_at IS NOT NULL");
        expect(query.mock.calls[0][0]).toContain("ORDER BY COALESCE(consumed_at, expires_at) ASC, id ASC");
        expect(query.mock.calls[0][1]).toEqual([now.toISOString(), 40]);
    });
});
