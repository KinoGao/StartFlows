import { NextResponse } from "next/server";

import { isBillingInputError, listBillingProducts } from "@/lib/server/billing-service";
import { getPaymentConfigSummary } from "@/lib/server/payment-config-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const [products, paymentConfig] = await Promise.all([listBillingProducts(false), getPaymentConfigSummary()]);
        return NextResponse.json({
            products,
            paymentProviders: paymentConfig.providers.filter((provider) => provider.enabled && provider.checkoutReady).map((provider) => provider.id),
        });
    } catch (error) {
        if (isBillingInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("List billing products failed", error);
        return NextResponse.json({ error: "获取套餐商品失败" }, { status: 500 });
    }
}
