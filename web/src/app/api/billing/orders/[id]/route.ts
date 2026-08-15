import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getBillingOrderForUser, isBillingInputError } from "@/lib/server/billing-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
    params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    try {
        const { id } = await context.params;
        return NextResponse.json({ order: await getBillingOrderForUser(currentUser.id, id) });
    } catch (error) {
        if (isBillingInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Get billing order failed", error);
        return NextResponse.json({ error: "获取订单失败" }, { status: 500 });
    }
}
