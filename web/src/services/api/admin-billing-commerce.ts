import type { BillingProduct, CouponTemplate, UserCoupon } from "@/services/api/billing";

export type PromotionCampaign = {
    id: string;
    name: string;
    label: string;
    enabled: boolean;
    startsAt: string;
    endsAt: string;
    products: Array<{ productId: string; promotionalAmountCents: number }>;
    createdAt: string;
    updatedAt: string;
};

export type PromotionCampaignInput = Pick<PromotionCampaign, "name" | "label" | "enabled" | "startsAt" | "endsAt" | "products">;

export type CouponTemplateInput = Pick<
    CouponTemplate,
    "code" | "name" | "description" | "discountType" | "discountValue" | "minimumAmountCents" | "maximumDiscountCents" | "stackWithPromotion" | "claimable" | "enabled" | "startsAt" | "endsAt" | "totalLimit" | "perUserLimit" | "productIds"
>;

type PageResult<T, K extends string> = Record<K, T[]> & { total: number; page: number; pageSize: number };

export function listAdminPromotions(page = 1, pageSize = 20) {
    return requestCommerce<PageResult<PromotionCampaign, "campaigns">>(`/api/admin/billing/promotions?page=${page}&pageSize=${pageSize}`);
}

export function createAdminPromotion(input: PromotionCampaignInput) {
    return requestCommerce<{ campaign: PromotionCampaign }>("/api/admin/billing/promotions", jsonRequest("POST", input));
}

export function updateAdminPromotion(id: string, input: PromotionCampaignInput) {
    return requestCommerce<{ campaign: PromotionCampaign }>(`/api/admin/billing/promotions/${encodeURIComponent(id)}`, jsonRequest("PATCH", input));
}

export function deleteAdminPromotion(id: string) {
    return requestCommerce<{ campaign: PromotionCampaign }>(`/api/admin/billing/promotions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function listAdminCouponTemplates(page = 1, pageSize = 20) {
    return requestCommerce<PageResult<CouponTemplate, "templates">>(`/api/admin/billing/coupon-templates?page=${page}&pageSize=${pageSize}`);
}

export function createAdminCouponTemplate(input: CouponTemplateInput) {
    return requestCommerce<{ template: CouponTemplate }>("/api/admin/billing/coupon-templates", jsonRequest("POST", input));
}

export function updateAdminCouponTemplate(id: string, input: CouponTemplateInput) {
    return requestCommerce<{ template: CouponTemplate }>(`/api/admin/billing/coupon-templates/${encodeURIComponent(id)}`, jsonRequest("PATCH", input));
}

export function deleteAdminCouponTemplate(id: string) {
    return requestCommerce<{ template: CouponTemplate }>(`/api/admin/billing/coupon-templates/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function grantAdminCoupon(input: { userId: string; templateId: string }) {
    return requestCommerce<{ coupon: UserCoupon }>("/api/admin/billing/coupons/grant", jsonRequest("POST", input));
}

export function adminProductLabel(products: BillingProduct[], productId: string) {
    return products.find((product) => product.id === productId)?.name || productId;
}

function jsonRequest(method: "POST" | "PATCH", body: unknown): RequestInit {
    return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

async function requestCommerce<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, { cache: "no-store", ...init });
    const payload = (await response.json().catch(() => null)) as { code?: number; data?: T; msg?: string } | null;
    if (!response.ok || !payload || payload.code !== 0 || payload.data === undefined) throw new Error(payload?.msg || "请求失败");
    return payload.data;
}
