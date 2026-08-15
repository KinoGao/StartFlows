import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { listClaimableCouponTemplates, listUserCoupons, listUserCouponsForProduct } from "@/lib/server/coupon-service";
import type { UserCouponStatus } from "@/lib/server/database/repository-shared";
import { commerceError, commerceOk } from "../commerce-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const params = request.nextUrl.searchParams;
        const input = {
            page: Number(params.get("page")) || 1,
            pageSize: Number(params.get("pageSize")) || 20,
            status: parseStatus(params.get("status")),
        };
        const productId = params.get("productId")?.trim();
        const includeTemplates = params.get("includeTemplates") !== "false";
        const templatePage = Number(params.get("templatePage")) || 1;
        const templatePageSize = Number(params.get("templatePageSize")) || input.pageSize;
        const [coupons, templates] = await Promise.all([
            productId ? listUserCouponsForProduct(user.id, { ...input, productId, quantity: params.get("quantity") }) : listUserCoupons(user.id, input),
            includeTemplates ? listClaimableCouponTemplates({ userId: user.id, page: templatePage, pageSize: templatePageSize }) : null,
        ]);
        return commerceOk({
            coupons: coupons.items,
            total: coupons.total,
            page: coupons.page,
            pageSize: coupons.pageSize,
            ...(templates ? { templates: templates.items, templatesTotal: templates.total, templatePage: templates.page, templatePageSize: templates.pageSize } : {}),
        });
    } catch (error) {
        return commerceError(error, "获取优惠券失败", "List user coupons failed");
    }
}

function parseStatus(value: string | null): UserCouponStatus | undefined {
    return value === "available" || value === "locked" || value === "redeemed" || value === "expired" || value === "revoked" ? value : undefined;
}
