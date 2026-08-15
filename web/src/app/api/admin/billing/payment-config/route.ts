import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { isAuthInputError } from "@/lib/auth/store";
import type { PaymentProviderId } from "@/lib/payment-config-types";
import { PAYMENT_PROVIDER_DEFINITIONS } from "@/lib/payment-config-types";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { savePaymentProviderConfig } from "@/lib/server/payment-config-store";
import { getPaymentConfigSummary } from "@/lib/server/payment-config-status";
import { BillingInputError } from "@/lib/server/billing-errors";
import { hasAdminPermission } from "@/lib/admin-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "billing.read")) return NextResponse.json({ error: "当前管理员没有查看支付配置的职责权限" }, { status: 403 });

    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    return NextResponse.json({ paymentConfig: await getPaymentConfigSummary(origin) });
}

export async function PATCH(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "billing.manage")) return NextResponse.json({ error: "当前管理员没有管理支付配置的职责权限" }, { status: 403 });

    let providerId: PaymentProviderId | undefined;
    try {
        const body = await readJsonBody<{ providerId?: unknown; enabled?: unknown; values?: unknown }>(request);
        providerId = normalizeProviderId(body.providerId);
        if (!providerId) return NextResponse.json({ error: "支付渠道无效" }, { status: 400 });
        await savePaymentProviderConfig({
            providerId,
            enabled: body.enabled === true,
            values: body.values && typeof body.values === "object" && !Array.isArray(body.values) ? (body.values as Record<string, unknown>) : {},
        });
        await safeRecordAuditLog({
            action: "admin.billing.payment-config.update",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "payment_provider", id: providerId },
            metadata: { enabled: body.enabled === true },
        });
        const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
        return NextResponse.json({ paymentConfig: await getPaymentConfigSummary(origin) });
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.billing.payment-config.update",
            status: "failure",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "payment_provider", id: providerId },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        console.error("Payment config save failed", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "保存支付配置失败" }, { status: isAuthInputError(error) || error instanceof BillingInputError ? error.status : 500 });
    }
}

function normalizeProviderId(value: unknown): PaymentProviderId | undefined {
    const text = typeof value === "string" ? value : "";
    return PAYMENT_PROVIDER_DEFINITIONS.some((provider) => provider.id === text) ? (text as PaymentProviderId) : undefined;
}
