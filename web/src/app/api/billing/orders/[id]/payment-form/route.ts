import type { NextRequest } from "next/server";

import { apiError } from "@/app/api/_shared/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import { isBillingInputError } from "@/lib/server/billing-service";
import { getStoredPaymentCheckoutForOrder } from "@/lib/server/payment-checkout-service";
import { createPaymentFormPage } from "@/lib/server/payment-form-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return apiError(401, "请先登录");
    try {
        const { id } = await context.params;
        const checkout = await getStoredPaymentCheckoutForOrder(id, currentUser.id);
        if (checkout.kind !== "form" || !checkout.form) return apiError(409, "当前订单不需要表单支付");
        const page = createPaymentFormPage(checkout.form);
        return new Response(page.html, {
            headers: {
                "Cache-Control": "no-store",
                "Content-Security-Policy": page.contentSecurityPolicy,
                "Content-Type": "text/html; charset=utf-8",
                "Referrer-Policy": "no-referrer",
                "X-Content-Type-Options": "nosniff",
                "X-Frame-Options": "DENY",
            },
        });
    } catch (error) {
        if (isBillingInputError(error)) return apiError(error.status, error.message);
        console.error("Open payment form failed", error);
        return apiError(500, "打开支付页面失败");
    }
}
