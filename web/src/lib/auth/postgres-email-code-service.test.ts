import { describe, expect, it, vi } from "vitest";

import type { QueryExecutor } from "@/lib/server/database";

import { consumePostgresEmailCode } from "./postgres-email-code-service";
import { hashToken } from "./store-normalizers";

function executorWithCode(input: { attempts: number; codeHash: string }) {
    const timestamp = new Date(Date.now() - 1000).toISOString();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const rows = [
        [
            {
                id: "code-one",
                purpose: "password-reset",
                email: "user@example.com",
                code_hash: input.codeHash,
                created_at: timestamp,
                expires_at: expiresAt,
                attempts: input.attempts,
            },
        ],
        [
            {
                id: "code-one",
                purpose: "password-reset",
                email: "user@example.com",
                code_hash: input.codeHash,
                created_at: timestamp,
                expires_at: expiresAt,
                attempts: input.attempts + 1,
            },
        ],
    ];
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: rows.shift() || [], rowCount: 1 }));
    return { executor: { query } as unknown as QueryExecutor, query };
}

describe("PostgreSQL email code consumption", () => {
    it("persists a wrong attempt without consuming the code", async () => {
        const { executor, query } = executorWithCode({ attempts: 0, codeHash: hashToken("654321") });

        const result = await consumePostgresEmailCode(executor, { purpose: "password-reset", email: "user@example.com", code: "123456" });

        expect(result).toMatchObject({ ok: false, error: { message: "邮箱验证码不正确或已过期" } });
        expect(query).toHaveBeenCalledTimes(2);
        expect(query.mock.calls[1]?.[1]).toEqual(["code-one", 1, null]);
    });

    it("invalidates the code on the sixth attempt", async () => {
        const { executor, query } = executorWithCode({ attempts: 5, codeHash: hashToken("123456") });

        const result = await consumePostgresEmailCode(executor, { purpose: "password-reset", email: "user@example.com", code: "123456" });

        expect(result).toMatchObject({ ok: false, error: { message: "验证码错误次数过多，请重新获取" } });
        expect(query.mock.calls[1]?.[1]?.[1]).toBe(6);
        expect(query.mock.calls[1]?.[1]?.[2]).toEqual(expect.any(String));
    });

    it("consumes a correct code atomically", async () => {
        const { executor, query } = executorWithCode({ attempts: 0, codeHash: hashToken("123456") });

        await expect(consumePostgresEmailCode(executor, { purpose: "password-reset", email: "user@example.com", code: "123456" })).resolves.toEqual({ ok: true });
        expect(query.mock.calls[1]?.[1]?.[2]).toEqual(expect.any(String));
    });
});
