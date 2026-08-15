import { createPostgresRepositories, type QueryExecutor } from "@/lib/server/database";

import { AuthInputError, EmailCodeAttemptError } from "./store-foundation";
import { hashToken, normalizeEmail } from "./store-normalizers";
import type { EmailCodePurpose } from "./store-types";

export type PostgresEmailCodeConsumption = { ok: true } | { ok: false; error: EmailCodeAttemptError };

export async function consumePostgresEmailCode(client: QueryExecutor, input: { purpose: EmailCodePurpose; email: string; code?: string; userId?: string }): Promise<PostgresEmailCodeConsumption> {
    const code = typeof input.code === "string" ? input.code.trim() : "";
    if (!/^\d{6}$/.test(code)) throw new AuthInputError("请输入 6 位邮箱验证码");

    const emailCodes = createPostgresRepositories(client).emailCodes;
    const now = new Date();
    const item = await emailCodes.findActive(
        {
            purpose: input.purpose,
            email: normalizeEmail(input.email),
            userId: input.userId,
            now: now.toISOString(),
        },
        true,
    );
    if (!item) throw new AuthInputError("邮箱验证码不正确或已过期");

    const attempts = item.attempts + 1;
    if (attempts > 5) {
        await emailCodes.updateAttempt(item.id, attempts, now.toISOString());
        return { ok: false, error: new EmailCodeAttemptError("验证码错误次数过多，请重新获取") };
    }
    if (item.codeHash !== hashToken(code)) {
        await emailCodes.updateAttempt(item.id, attempts);
        return { ok: false, error: new EmailCodeAttemptError("邮箱验证码不正确或已过期") };
    }

    await emailCodes.updateAttempt(item.id, attempts, now.toISOString());
    return { ok: true };
}
