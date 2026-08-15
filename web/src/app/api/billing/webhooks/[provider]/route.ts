import { NextResponse } from "next/server";

import { BillingInputError, isBillingInputError } from "@/lib/server/billing-service";
import { processPaymentWebhook } from "@/lib/server/payment-webhook-service";
import { readRequestBodyText, RequestBodyTooLargeError } from "@/lib/server/request-body-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
    params: Promise<{ provider: string }>;
};
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

export async function POST(request: Request, context: RouteContext) {
    try {
        const { provider } = await context.params;
        const result = await processPaymentWebhook({
            provider,
            rawBody: await readRequestBodyText(request, MAX_WEBHOOK_BODY_BYTES),
            headers: request.headers,
        });
        return NextResponse.json(result);
    } catch (error) {
        if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: error.message }, { status: error.status });
        if (isBillingInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        if (error instanceof BillingInputError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Payment webhook failed", error);
        return NextResponse.json({ error: "支付回调处理失败" }, { status: 500 });
    }
}
