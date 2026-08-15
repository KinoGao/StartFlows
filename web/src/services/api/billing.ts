export type BillingProduct = {
    id: string;
    productKind: "plan" | "points";
    planId?: string;
    name: string;
    description: string;
    amountCents: number;
    currency: string;
    pointsAmount: number;
    dailyPoints: number;
    periodDays: number;
    enabled: boolean;
    sortOrder: number;
    metadata?: unknown;
    pricing: {
        listUnitAmountCents: number;
        saleUnitAmountCents: number;
        discountCents: number;
        promotion?: {
            id: string;
            label: string;
            unitAmountCents: number;
            startsAt: string;
            endsAt: string;
        };
    };
    createdAt: string;
    updatedAt: string;
};

export type BillingOrderStatus = "pending" | "paid" | "closed" | "canceled" | "refunding" | "refunded";

export type BillingOrder = {
    id: string;
    orderNo: string;
    productId?: string;
    userId?: string;
    userAccountId?: string;
    userUsername?: string;
    userDisplayName?: string;
    productKind: "plan" | "points";
    planId?: string;
    status: BillingOrderStatus;
    subject: string;
    listAmountCents: number;
    promotionDiscountCents: number;
    couponDiscountCents: number;
    amountCents: number;
    currency: string;
    pointsAmount: number;
    dailyPoints: number;
    periodDays: number;
    quantity: number;
    provider: string;
    providerOrderId?: string;
    providerPaymentId?: string;
    promotionCampaignId?: string;
    userCouponId?: string;
    expiresAt?: string;
    paidAt?: string;
    closedAt?: string;
    pricingSnapshot?: unknown;
    metadata?: unknown;
    createdAt: string;
    updatedAt: string;
};

export type CouponTemplate = {
    id: string;
    code: string;
    name: string;
    description: string;
    discountType: "fixed" | "percentage";
    discountValue: number;
    minimumAmountCents: number;
    maximumDiscountCents: number;
    stackWithPromotion: boolean;
    claimable: boolean;
    enabled: boolean;
    startsAt: string;
    endsAt: string;
    totalLimit: number;
    perUserLimit: number;
    issuedCount: number;
    redeemedCount: number;
    productIds: string[];
    createdAt: string;
    updatedAt: string;
};

export type UserCouponStatus = "available" | "locked" | "redeemed" | "expired" | "revoked";

export type UserCoupon = {
    id: string;
    templateId: string;
    userId: string;
    status: UserCouponStatus;
    grantSource: string;
    claimedAt: string;
    expiresAt: string;
    lockedOrderId?: string;
    lockedAt?: string;
    redeemedOrderId?: string;
    redeemedAt?: string;
    revokedAt?: string;
    template?: CouponTemplate;
    applicable?: boolean;
    unavailableReason?: string;
    createdAt: string;
    updatedAt: string;
};

export type BillingQuote = {
    productId: string;
    quantity: number;
    listAmountCents: number;
    promotionDiscountCents: number;
    couponDiscountCents: number;
    payableAmountCents: number;
    promotion?: BillingProduct["pricing"]["promotion"];
    pricingSnapshot: unknown;
};

export type PaymentCheckout = {
    provider: string;
    orderId: string;
    orderNo: string;
    kind: "manual" | "redirect" | "form" | "qr";
    url?: string;
    form?: {
        action: string;
        method: "GET" | "POST";
        fields: Array<{ name: string; value: string }>;
    };
    qrContent?: string;
    providerOrderId?: string;
    providerPaymentId?: string;
    expiresAt?: string;
};

export async function listBillingProducts() {
    return requestBilling<{ products: BillingProduct[]; paymentProviders: string[] }>("/api/billing/products");
}

export async function listBillingOrders(input: { page?: number; pageSize?: number; status?: BillingOrderStatus } = {}) {
    const params = new URLSearchParams();
    if (input.page) params.set("page", String(input.page));
    if (input.pageSize) params.set("pageSize", String(input.pageSize));
    if (input.status) params.set("status", input.status);
    const query = params.toString();
    return requestBilling<{ orders: BillingOrder[]; total: number; page: number; pageSize: number }>(`/api/billing/orders${query ? `?${query}` : ""}`);
}

export async function getBillingOrder(orderId: string) {
    return requestBilling<{ order: BillingOrder }>(`/api/billing/orders/${encodeURIComponent(orderId)}`);
}

export function subscribeBillingOrder(orderId: string, onOrder: (order: BillingOrder) => void, onError: () => void) {
    const source = new EventSource(`/api/billing/orders/${encodeURIComponent(orderId)}/events`);
    source.onmessage = (event) => {
        try {
            const payload = JSON.parse(event.data) as { code?: number; data?: { order?: BillingOrder } | null };
            if (payload.code !== 0 || !payload.data?.order) throw new Error("订单状态响应无效");
            onOrder(payload.data.order);
            if (payload.data.order.status !== "pending") source.close();
        } catch {
            onError();
        }
    };
    source.onerror = onError;
    return () => source.close();
}

export async function cancelBillingOrder(orderId: string) {
    return requestBilling<{ order: BillingOrder }>(`/api/billing/orders/${encodeURIComponent(orderId)}/cancel`, { method: "POST" });
}

export async function createBillingOrder(input: { productId: string; provider: string; quantity?: number; userCouponId?: string }) {
    return requestBilling<{ order: BillingOrder }>("/api/billing/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
}

export async function listBillingCoupons(input: { page?: number; pageSize?: number; status?: UserCouponStatus; productId?: string; quantity?: number; includeTemplates?: boolean; templatePage?: number; templatePageSize?: number } = {}) {
    const params = new URLSearchParams();
    if (input.page) params.set("page", String(input.page));
    if (input.pageSize) params.set("pageSize", String(input.pageSize));
    if (input.status) params.set("status", input.status);
    if (input.productId) params.set("productId", input.productId);
    if (input.quantity) params.set("quantity", String(input.quantity));
    if (input.includeTemplates !== undefined) params.set("includeTemplates", String(input.includeTemplates));
    if (input.templatePage) params.set("templatePage", String(input.templatePage));
    if (input.templatePageSize) params.set("templatePageSize", String(input.templatePageSize));
    const query = params.toString();
    return requestCommerce<{ coupons: UserCoupon[]; templates?: CouponTemplate[]; templatesTotal?: number; templatePage?: number; templatePageSize?: number; total: number; page: number; pageSize: number }>(
        `/api/billing/coupons${query ? `?${query}` : ""}`,
    );
}

export async function claimBillingCoupon(input: { templateId?: string; code?: string }) {
    return requestCommerce<{ coupon: UserCoupon }>("/api/billing/coupons/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
}

export async function quoteBillingOrder(input: { productId: string; quantity?: number; userCouponId?: string }) {
    return requestCommerce<{ quote: BillingQuote }>("/api/billing/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
}

export async function createPaymentCheckout(orderId: string, input: { provider?: string } = {}) {
    return requestBilling<{ checkout: PaymentCheckout }>(`/api/billing/orders/${encodeURIComponent(orderId)}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
}

async function requestBilling<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, { cache: "no-store", ...init });
    const payload = (await response.json().catch(() => ({}))) as (T & { error?: string }) | { code: number; data: T | null; msg: string; error?: string };
    if (!response.ok) throw new Error(("msg" in payload && payload.msg) || payload.error || "请求失败");
    if ("code" in payload) {
        if (payload.code !== 0 || payload.data === null) throw new Error(payload.msg || "请求失败");
        return payload.data;
    }
    return payload;
}

async function requestCommerce<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, { cache: "no-store", ...init });
    const payload = (await response.json().catch(() => null)) as { code?: number; data?: T; msg?: string } | null;
    if (!response.ok || !payload || payload.code !== 0 || payload.data === undefined) throw new Error(payload?.msg || "请求失败");
    return payload.data;
}
