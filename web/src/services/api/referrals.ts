import type { CouponTemplate } from "./billing";

export type ReferralRiskStatus = "clear" | "review" | "frozen" | "rejected";
export type ReferralRewardStatus = "pending" | "settled" | "revoked" | "rejected" | "reversal_pending";

export type AdminReferralStats = {
    clicks: number;
    registrations: number;
    qualified: number;
    pending: number;
    settled: number;
    risky: number;
};

export type ReferralProgram = {
    id?: "default";
    enabled: boolean;
    inviterPoints: number;
    inviteeRewardType: "points" | "coupon";
    inviteePoints: number;
    inviteeCouponTemplateId?: string;
    minimumPaidCents: number;
    coolingOffDays: number;
    inviterMonthlyLimit?: number;
    campaignTotalLimit?: number;
    autoFreezeRisk?: boolean;
    createdAt?: string;
    updatedAt?: string;
};

export type ReferralRelationship = {
    id: string;
    inviterUserId: string;
    inviteeUserId: string;
    code?: string;
    inviterUsername?: string;
    inviterDisplayName?: string;
    inviterAccountId?: string;
    inviteeUsername?: string;
    inviteeDisplayName?: string;
    inviteeAccountId?: string;
    riskStatus: ReferralRiskStatus;
    riskSignals: unknown;
    attributionSource: string;
    registeredAt: string;
};

export type ReferralReward = {
    id: string;
    relationshipId: string;
    beneficiaryUserId: string;
    beneficiaryRole: "inviter" | "invitee";
    rewardType: "points" | "coupon";
    pointsAmount: number;
    couponTemplateId?: string;
    triggerOrderId: string;
    status: ReferralRewardStatus;
    settleAfter: string;
    reason?: string;
    settledAt?: string;
    revokedAt?: string;
    createdAt: string;
    beneficiaryUsername?: string;
    beneficiaryDisplayName?: string;
    beneficiaryAccountId?: string;
};

export type ReferralCenter = {
    program: Pick<ReferralProgram, "enabled" | "inviterPoints" | "inviteeRewardType" | "inviteePoints" | "minimumPaidCents" | "coolingOffDays">;
    code: string;
    link: string;
    stats: { clicks: number; registrations: number; qualified: number; pending: number; settled: number; revoked: number };
    referrals: Array<{ id: string; inviteeName: string; riskStatus: ReferralRiskStatus; registeredAt: string }>;
    referralsTotal: number;
    referralsPage: number;
    referralsPageSize: number;
    rewards: ReferralReward[];
    rewardsTotal: number;
    rewardsPage: number;
    rewardsPageSize: number;
};

export async function getReferralCenter(input: { referralsPage?: number; rewardsPage?: number; pageSize?: number } = {}) {
    const query = new URLSearchParams();
    if (input.referralsPage) query.set("referralsPage", String(input.referralsPage));
    if (input.rewardsPage) query.set("rewardsPage", String(input.rewardsPage));
    if (input.pageSize) query.set("pageSize", String(input.pageSize));
    return requestReferral<ReferralCenter>(`/api/referrals${query.size ? `?${query}` : ""}`);
}

export async function getAdminReferralOverview() {
    return requestReferral<{ program: ReferralProgram; stats: AdminReferralStats }>("/api/admin/referrals");
}

export async function listAdminReferralCouponTemplates(input: { keyword?: string; selectedId?: string; pageSize?: number } = {}) {
    const query = new URLSearchParams({ page: "1", pageSize: String(input.pageSize || 20), includeDisabled: "false" });
    if (input.keyword) query.set("keyword", input.keyword);
    if (input.selectedId) query.set("selectedId", input.selectedId);
    return requestReferral<{ templates: CouponTemplate[]; total: number; page: number; pageSize: number }>(`/api/admin/billing/coupon-templates?${query}`);
}

export async function saveAdminReferralProgram(program: ReferralProgram) {
    return requestReferral<{ program: ReferralProgram }>("/api/admin/referrals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(program) });
}

export async function listAdminReferralRelationships(input: { page?: number; pageSize?: number; keyword?: string; riskStatus?: ReferralRiskStatus } = {}) {
    const query = new URLSearchParams();
    if (input.page) query.set("page", String(input.page));
    if (input.pageSize) query.set("pageSize", String(input.pageSize));
    if (input.keyword) query.set("keyword", input.keyword);
    if (input.riskStatus) query.set("riskStatus", input.riskStatus);
    return requestReferral<{ items: ReferralRelationship[]; total: number; page: number; pageSize: number }>(`/api/admin/referrals/relationships?${query}`);
}

export async function updateAdminReferralRelationship(id: string, input: { riskStatus: ReferralRiskStatus; reason?: string }) {
    return requestReferral<{ relationship: ReferralRelationship }>(`/api/admin/referrals/relationships/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
}

export async function listAdminReferralRewards(input: { page?: number; pageSize?: number; status?: ReferralRewardStatus } = {}) {
    const query = new URLSearchParams();
    if (input.page) query.set("page", String(input.page));
    if (input.pageSize) query.set("pageSize", String(input.pageSize));
    if (input.status) query.set("status", input.status);
    return requestReferral<{ items: ReferralReward[]; total: number; page: number; pageSize: number }>(`/api/admin/referrals/rewards?${query}`);
}

export async function settleAdminReferralRewards() {
    return requestReferral<{ processed: number; settled: number; rejected: number }>("/api/admin/referrals/settle", { method: "POST" });
}

async function requestReferral<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, { cache: "no-store", ...init });
    const payload = (await response.json().catch(() => null)) as { code?: number; data?: T; msg?: string } | null;
    if (!response.ok || !payload || payload.code !== 0 || payload.data === undefined) throw new Error(payload?.msg || "请求失败");
    return payload.data;
}
