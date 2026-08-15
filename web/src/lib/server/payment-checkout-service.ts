import { BillingInputError } from "@/lib/server/billing-errors";
import { expirePendingBillingOrders } from "@/lib/server/billing-order-expiration-service";
import { isAutomaticallyExpiredOrder } from "@/lib/server/billing-service-helpers";
import { createPostgresRepositories, isPostgresDatabaseEnabled, withPostgresTransaction } from "@/lib/server/database";
import { getPaymentRuntimeConfig, isPaymentRuntimeProviderCheckoutReady } from "@/lib/server/payment-config-store";
import { checkoutFromMetadata, checkoutMetadata, createProviderCheckout, mergeMetadata, normalizeId, normalizeProvider } from "./payment-checkout-providers";
import type { CreatePaymentCheckoutOptions } from "./payment-checkout-types";

export async function createPaymentCheckoutForOrder(orderId: string, options: CreatePaymentCheckoutOptions = {}) {
    if (!isPostgresDatabaseEnabled()) throw new BillingInputError("支付下单需要启用 PostgreSQL", 501);
    await expirePendingBillingOrders({ orderId });

    const paymentConfig = await getPaymentRuntimeConfig();
    return withPostgresTransaction(async (client) => {
        const repos = createPostgresRepositories(client);
        const order = await repos.billing.getOrderById(normalizeId(orderId), true);
        assertPayableOrder(order, options.userId);

        const provider = resolveCheckoutProvider(order.provider, options.provider);
        if (!isPaymentRuntimeProviderCheckoutReady(paymentConfig, provider)) throw new BillingInputError("该支付渠道未启用或配置不完整", 400);
        const existing = checkoutFromMetadata(order, provider);
        if (existing) return existing;

        const checkout = await createProviderCheckout(provider, order, options, paymentConfig);
        const metadata = mergeMetadata(order.metadata, { checkout: checkoutMetadata(checkout) });
        await repos.billing.updateOrder(order.id, {
            provider,
            providerOrderId: checkout.providerOrderId,
            providerPaymentId: checkout.providerPaymentId,
            metadata,
        });
        return checkout;
    });
}

export async function getStoredPaymentCheckoutForOrder(orderId: string, userId: string) {
    if (!isPostgresDatabaseEnabled()) throw new BillingInputError("支付下单需要启用 PostgreSQL", 501);
    return withPostgresTransaction(async (client) => {
        const order = await createPostgresRepositories(client).billing.getOrderById(normalizeId(orderId), false);
        assertPayableOrder(order, userId);
        const provider = normalizeProvider(order.provider);
        const checkout = checkoutFromMetadata(order, provider);
        if (!checkout) throw new BillingInputError("支付参数不存在或已过期，请重新发起支付", 409);
        return checkout;
    });
}

export function resolveCheckoutProvider(orderProvider: unknown, requestedProvider: unknown) {
    const provider = normalizeProvider(orderProvider);
    const requested = requestedProvider === undefined || requestedProvider === null || requestedProvider === "" ? provider : normalizeProvider(requestedProvider);
    if (requested !== provider) throw new BillingInputError("订单支付渠道已锁定，请重新创建订单后更换渠道", 409);
    return provider;
}

function assertPayableOrder(order: Awaited<ReturnType<ReturnType<typeof createPostgresRepositories>["billing"]["getOrderById"]>>, userId?: string): asserts order is NonNullable<typeof order> {
    if (!order || (userId && order.userId !== userId)) throw new BillingInputError("订单不存在", 404);
    if (isAutomaticallyExpiredOrder(order) || (order.expiresAt && Date.parse(order.expiresAt) <= Date.now())) throw new BillingInputError("订单已过期", 409);
    if (order.status !== "pending") throw new BillingInputError("当前订单状态不能发起支付", 409);
}
