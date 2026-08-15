import { BillingInputError } from "@/lib/server/billing-errors";
import { createPostgresRepositories, ensurePostgresSchema, isPostgresDatabaseEnabled } from "@/lib/server/database";

export async function expirePendingBillingOrders(input: { now?: Date; limit?: number; orderId?: string } = {}) {
    if (!isPostgresDatabaseEnabled()) throw new BillingInputError("商业订单需要启用 PostgreSQL", 501);
    await ensurePostgresSchema();

    const limit = Math.max(1, Math.min(Math.trunc(input.limit || 100), 500));
    return createPostgresRepositories().billing.expirePendingOrders({
        expiredAt: (input.now || new Date()).toISOString(),
        limit,
        orderId: input.orderId?.trim() || undefined,
    });
}
