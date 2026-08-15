import type { NextRequest } from "next/server";

import { apiCompatError, apiSuccess } from "@/app/api/_shared/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { BillingInputError, isBillingInputError } from "@/lib/server/billing-service";
import { createPaymentCheckoutForOrder } from "@/lib/server/payment-checkout-service";
import { readRequestBodyText, RequestBodyTooLargeError } from "@/lib/server/request-body-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHECKOUT_BODY_BYTES = 16 * 1024;

type RouteContext = {
    params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return apiCompatError(401, "请先登录");

    const { id } = await context.params;
    try {
        const body = await readOptionalJsonBody<{ provider?: unknown }>(request);
        const checkout = await createPaymentCheckoutForOrder(id, {
            userId: currentUser.id,
            provider: body.provider,
            origin: request.nextUrl.origin,
        });
        await safeRecordAuditLog({
            action: "billing.order.checkout",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "billing_order", id: checkout.orderId, label: checkout.orderNo },
            metadata: { provider: checkout.provider, kind: checkout.kind, providerOrderId: checkout.providerOrderId },
        });
        return apiSuccess({ checkout }, "支付参数已创建");
    } catch (error) {
        await safeRecordAuditLog({
            action: "billing.order.checkout",
            status: "failure",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "billing_order", id },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        if (isBillingInputError(error)) return apiCompatError(error.status, error.message);
        if (error instanceof RequestBodyTooLargeError) return apiCompatError(error.status, error.message);
        console.error("Create payment checkout failed", error);
        return apiCompatError(500, "创建支付参数失败");
    }
}

async function readOptionalJsonBody<T>(request: Request) {
    const text = await readRequestBodyText(request, MAX_CHECKOUT_BODY_BYTES);
    if (!text.trim()) return {} as T;
    try {
        return JSON.parse(text) as T;
    } catch {
        throw new BillingInputError("请求内容不是有效 JSON");
    }
}
