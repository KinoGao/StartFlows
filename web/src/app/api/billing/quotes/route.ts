import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { quoteBillingOrder } from "@/lib/server/billing-commerce-service";
import { commerceError, commerceOk } from "../commerce-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const body = await readJsonBody<{ productId?: unknown; quantity?: unknown; userCouponId?: unknown }>(request);
        return commerceOk({ quote: await quoteBillingOrder({ ...body, userId: user.id }) });
    } catch (error) {
        return commerceError(error, "获取结算价格失败", "Quote billing order failed");
    }
}
