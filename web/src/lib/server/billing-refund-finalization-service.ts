import { lockAuthMutation } from "@/lib/server/auth-mutation-lock";
import { refundBillingOrderCoupon } from "@/lib/server/billing-commerce-service";
import { BillingInputError } from "@/lib/server/billing-errors";
import { createPostgresRepositories, withPostgresTransaction, type JsonValue, type PaymentTransactionRecord } from "@/lib/server/database";
import { adjustPermanentPointsInPostgresTransaction } from "@/lib/server/points-wallet-service";
import { reverseReferralRewardsForRefundedOrder } from "@/lib/server/referral-service";
import { buildRefundedOrderResult, mergeJson, paymentRefundMetadata, sanitizeJson } from "@/lib/server/billing-service-helpers";
import type { PaymentRefundResult } from "@/lib/server/payment-refund-service";

export type BillingRefundFinalizationInput = {
    orderId: string;
    paymentId?: string;
    reason: string;
    operatorUserId: string;
    providerRefund: PaymentRefundResult;
    rawPayload?: unknown;
};

export async function finalizeBillingOrderRefund(input: BillingRefundFinalizationInput) {
    return withPostgresTransaction(async (client) => {
        await lockAuthMutation(client);
        const repos = createPostgresRepositories(client);
        const order = await repos.billing.getOrderById(input.orderId, true);
        if (!order) throw new BillingInputError("订单不存在", 404);
        if (order.status === "refunded") return buildRefundedOrderResult(order, client);
        if (order.status !== "refunding") throw new BillingInputError("退款状态已变化，请刷新后重试", 409);
        if (!order.userId) throw new BillingInputError("订单没有绑定用户", 409);

        const payment = await repos.billing.findOrderPayment({ orderId: order.id, preferredPaymentId: input.paymentId, statuses: ["succeeded", "refunded"] });
        const user = await repos.users.getById(order.userId);
        if (!user) throw new BillingInputError("订单用户不存在", 404);
        const now = new Date().toISOString();
        await refundBillingOrderCoupon(client, order, now);

        const refundedPayment = payment ? await markPaymentRefunded(payment, input, now, repos.billing.updatePaymentState) : undefined;
        const assignment = order.productKind === "plan" ? await repos.billing.getPlanAssignmentBySource("order", order.id) : null;
        const canceledAssignment = assignment
            ? await repos.billing.updatePlanAssignment(assignment.id, {
                  status: "canceled",
                  endsAt: now,
                  metadata: mergeJson(assignment.metadata, { refund: { reason: input.reason, refundedAt: now } }),
              })
            : undefined;

        const walletAdjustment = order.pointsAmount
            ? await adjustPermanentPointsInPostgresTransaction(client, {
                  userId: user.id,
                  amount: -order.pointsAmount,
                  description: `订单退款：${order.subject}`,
                  idempotencyKey: `billing-order:${order.id}:refund`,
                  type: "admin-adjust",
                  requireActive: false,
                  now: new Date(now),
              })
            : null;
        const pointsReversed = Math.max(0, -(walletAdjustment?.record.amount || 0));
        await reverseReferralRewardsForRefundedOrder(client, { orderId: order.id, refundedAt: now, reason: input.reason });

        let updatedUser = user;
        if (order.productKind === "plan") {
            const activeAssignment = await repos.billing.getActivePlanAssignment(user.id, new Date(now));
            const settings = await repos.settings.getSettings();
            const planUser = await repos.users.update(user.id, { planId: activeAssignment?.planId || settings.settings?.defaultPlanId || "free" });
            if (!planUser) throw new BillingInputError("订单用户不存在", 404);
            updatedUser = planUser;
        } else {
            const refreshed = await repos.users.getById(user.id);
            if (!refreshed) throw new BillingInputError("订单用户不存在", 404);
            updatedUser = refreshed;
        }

        const updatedOrder = await repos.billing.updateOrder(order.id, {
            status: "refunded",
            closedAt: now,
            metadata: mergeJson(order.metadata, {
                refund: {
                    reason: input.reason,
                    operatorUserId: input.operatorUserId,
                    refundedAt: now,
                    pointsReversed,
                    providerRefund: paymentRefundMetadata(input.providerRefund, false),
                },
            }),
        });
        if (!updatedOrder) throw new BillingInputError("订单不存在", 404);
        return { order: updatedOrder, payment: refundedPayment, assignment: canceledAssignment, user: updatedUser, pointsReversed, providerRefund: input.providerRefund };
    });
}

async function markPaymentRefunded(payment: PaymentTransactionRecord, input: BillingRefundFinalizationInput, now: string, upsert: (payment: PaymentTransactionRecord) => Promise<PaymentTransactionRecord>) {
    return upsert({
        ...payment,
        status: "refunded",
        rawPayload: mergeJson(payment.rawPayload, {
            refund: {
                reason: input.reason,
                operatorUserId: input.operatorUserId,
                refundedAt: now,
                rawPayload: sanitizeJson(input.rawPayload) as JsonValue,
                providerRefund: paymentRefundMetadata(input.providerRefund, true),
            },
        }),
        refundedAt: now,
        updatedAt: now,
    });
}
