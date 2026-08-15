import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    adjustPoints: vi.fn(),
    assertReady: vi.fn(),
    issueCoupon: vi.fn(),
    lockAuthMutation: vi.fn(),
    makeRepositories: vi.fn(),
    transaction: vi.fn(),
}));

vi.mock("@/lib/server/auth-mutation-lock", () => ({ lockAuthMutation: mocks.lockAuthMutation }));
vi.mock("@/lib/server/billing-service-helpers", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/server/billing-service-helpers")>()),
    assertBillingDatabaseReady: mocks.assertReady,
}));
vi.mock("@/lib/server/coupon-service", () => ({ issueCouponInPostgresTransaction: mocks.issueCoupon }));
vi.mock("@/lib/server/database", () => ({
    createPostgresRepositories: mocks.makeRepositories,
    withPostgresTransaction: mocks.transaction,
}));
vi.mock("@/lib/server/points-wallet-service", () => ({ adjustPermanentPointsInPostgresTransaction: mocks.adjustPoints }));

import { BillingInputError } from "@/lib/server/billing-errors";
import { getOrCreateReferralCode, getReferralCenter, recordReferralVisit, saveReferralProgram, settleDueReferralRewards, updateReferralRelationshipRisk } from "./referral-service";

describe("referral program settings", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.assertReady.mockResolvedValue(undefined);
    });

    it("preserves omitted PATCH fields", async () => {
        const current = {
            id: "default",
            enabled: true,
            inviterPoints: 100,
            inviteeRewardType: "points",
            inviteePoints: 50,
            minimumPaidCents: 1000,
            coolingOffDays: 7,
            inviterMonthlyLimit: 10,
            campaignTotalLimit: 100,
            autoFreezeRisk: false,
            createdAt: "2026-07-27T00:00:00.000Z",
            updatedAt: "2026-07-27T00:00:00.000Z",
        } as const;
        const upsertProgram = vi.fn(async (program) => program);
        mocks.makeRepositories.mockReturnValue({
            referrals: { getProgram: vi.fn(async () => current), upsertProgram },
            coupons: { getTemplateById: vi.fn() },
        });
        mocks.transaction.mockImplementation(async (handler) => handler({ query: vi.fn() }));

        await expect(saveReferralProgram({ minimumPaidCents: 2000 }, "admin-one")).resolves.toMatchObject({
            enabled: true,
            inviteeRewardType: "points",
            minimumPaidCents: 2000,
            autoFreezeRisk: false,
        });
        expect(upsertProgram).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, inviteeRewardType: "points", autoFreezeRisk: false }));
    });
});

describe("referral visit tracking", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.assertReady.mockResolvedValue(undefined);
        mocks.transaction.mockImplementation(async (handler) => handler({ query: vi.fn() }));
    });

    it("validates a code without incrementing clicks when countClick is false", async () => {
        const recordClick = vi.fn();
        const getCodeByCode = vi.fn(async () => ({ code: "ABCD2388", enabled: true }));
        mocks.makeRepositories.mockReturnValue({
            referrals: {
                getProgram: vi.fn(async () => ({ enabled: true })),
                getCodeByCode,
                recordClick,
            },
        });

        await expect(recordReferralVisit("abcd2388", { countClick: false })).resolves.toMatchObject({ code: "ABCD2388" });
        expect(getCodeByCode).toHaveBeenCalledWith("ABCD2388");
        expect(recordClick).not.toHaveBeenCalled();
    });
});

describe("referral code creation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.assertReady.mockResolvedValue(undefined);
        mocks.transaction.mockImplementation(async (handler) => handler({ query: vi.fn() }));
    });

    it("derives one stable code from the unique public account id without collision retries", async () => {
        const createCode = vi.fn(async (record) => record);
        const referrals = { getCodeByUserId: vi.fn(async () => null), createCode };
        mocks.makeRepositories.mockReturnValue({ referrals, users: { getById: vi.fn(async () => ({ id: "user-one", accountId: "0001", status: "active" })) } });

        await expect(getOrCreateReferralCode("user-one")).resolves.toMatchObject({ code: "VZ0001" });

        expect(createCode).toHaveBeenCalledTimes(1);
        expect(createCode).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-one", code: "VZ0001" }));
    });

    it("returns the concurrently created code after the single insert loses the user uniqueness race", async () => {
        const concurrent = { id: "code-one", userId: "user-one", code: "VZ0001", enabled: true };
        const getCodeByUserId = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(concurrent);
        const createCode = vi.fn(async () => null);
        mocks.makeRepositories.mockReturnValue({ referrals: { getCodeByUserId, createCode }, users: { getById: vi.fn(async () => ({ id: "user-one", accountId: "0001", status: "active" })) } });

        await expect(getOrCreateReferralCode("user-one")).resolves.toBe(concurrent);
        expect(createCode).toHaveBeenCalledTimes(1);
        expect(getCodeByUserId).toHaveBeenCalledTimes(2);
    });
});

describe("referral center pagination", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.assertReady.mockResolvedValue(undefined);
    });

    it("queries invitation progress and rewards with independent server pages", async () => {
        const referrals = {
            getProgram: vi.fn(async () => ({ enabled: true, inviterPoints: 10, inviteeRewardType: "points", inviteePoints: 5, minimumPaidCents: 100, coolingOffDays: 1 })),
            getCodeByUserId: vi.fn(async () => ({ code: "INVITE88" })),
            getUserStats: vi.fn(async () => ({ clicks: 1, registrations: 1, qualified: 1, pending: 0, settled: 1, revoked: 0 })),
            listRelationships: vi.fn(async () => ({ items: [], total: 17, page: 2, pageSize: 8 })),
            listRewards: vi.fn(async () => ({ items: [], total: 25, page: 3, pageSize: 8 })),
        };
        mocks.makeRepositories.mockReturnValue({ referrals, users: { getById: vi.fn(async () => ({ id: "user-one", status: "active" })) } });
        mocks.transaction.mockImplementation(async (handler) => handler({ query: vi.fn() }));

        await expect(getReferralCenter("user-one", "https://example.com", { referralsPage: 2, rewardsPage: 3, pageSize: 8 })).resolves.toMatchObject({ referralsTotal: 17, referralsPage: 2, rewardsTotal: 25, rewardsPage: 3 });

        expect(referrals.listRelationships).toHaveBeenCalledWith({ inviterUserId: "user-one", page: 2, pageSize: 8 });
        expect(referrals.listRewards).toHaveBeenCalledWith({ beneficiaryUserId: "user-one", page: 3, pageSize: 8 });
    });
});

describe("referral reward settlement", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.assertReady.mockResolvedValue(undefined);
        mocks.lockAuthMutation.mockResolvedValue(undefined);
    });

    it("rolls back coupon issuance and partial statuses before rejecting the reward pair", async () => {
        const state = {
            coupons: [] as string[],
            rewardStatuses: new Map([
                ["coupon-reward", "pending"],
                ["points-reward", "pending"],
            ]),
        };
        let snapshot: { coupons: string[]; rewardStatuses: Map<string, string> } | undefined;
        const query = vi.fn(async (sql: string) => {
            if (sql.startsWith("SAVEPOINT")) snapshot = { coupons: [...state.coupons], rewardStatuses: new Map(state.rewardStatuses) };
            if (sql.startsWith("ROLLBACK TO SAVEPOINT") && snapshot) {
                state.coupons = [...snapshot.coupons];
                state.rewardStatuses = new Map(snapshot.rewardStatuses);
            }
            return { rows: [] };
        });
        const client = { query };
        const now = "2026-07-27T00:00:00.000Z";
        const rewards = [
            {
                id: "coupon-reward",
                relationshipId: "relationship-one",
                beneficiaryUserId: "invitee-one",
                beneficiaryRole: "invitee",
                rewardType: "coupon",
                couponTemplateId: "template-one",
                pointsAmount: 0,
                triggerOrderId: "order-one",
                status: "pending",
                settleAfter: now,
                createdAt: now,
                updatedAt: now,
            },
            {
                id: "points-reward",
                relationshipId: "relationship-one",
                beneficiaryUserId: "inviter-one",
                beneficiaryRole: "inviter",
                rewardType: "points",
                pointsAmount: 100,
                triggerOrderId: "order-one",
                status: "pending",
                settleAfter: now,
                createdAt: now,
                updatedAt: now,
            },
        ];
        const updateReward = vi.fn(async (id: string, patch: { status?: string }) => {
            if (patch.status) state.rewardStatuses.set(id, patch.status);
            return { id, ...patch };
        });
        const referrals = {
            getProgram: vi.fn(async () => ({ enabled: true, inviterMonthlyLimit: 0, campaignTotalLimit: 0 })),
            lockDueRewards: vi.fn(async () => [rewards[0]]),
            getRelationshipById: vi.fn(async () => ({ id: "relationship-one", inviterUserId: "inviter-one", riskStatus: "clear" })),
            getRewardsByRelationship: vi.fn(async () => rewards),
            countSettledInviterRewards: vi.fn(async () => ({ monthly: 0, total: 0 })),
            countAllSettledInviterRewards: vi.fn(async () => 0),
            updateReward,
        };
        mocks.makeRepositories.mockReturnValue({ referrals, users: { getById: vi.fn(async () => ({ id: "inviter-one" })) } });
        mocks.transaction.mockImplementation(async (handler) => handler(client));
        mocks.issueCoupon.mockImplementation(async () => {
            state.coupons.push("issued-coupon");
            return { id: "issued-coupon" };
        });
        mocks.adjustPoints.mockRejectedValue(new BillingInputError("积分发放失败", 409));

        await expect(settleDueReferralRewards({ now: new Date(now) })).resolves.toEqual({ processed: 1, settled: 0, rejected: 2 });

        expect(state.coupons).toEqual([]);
        expect(Object.fromEntries(state.rewardStatuses)).toEqual({ "coupon-reward": "rejected", "points-reward": "rejected" });
        expect(query.mock.calls.map(([sql]) => sql)).toEqual(["SAVEPOINT referral_reward_settlement", "ROLLBACK TO SAVEPOINT referral_reward_settlement", "RELEASE SAVEPOINT referral_reward_settlement"]);
        expect(updateReward).toHaveBeenCalledWith("coupon-reward", expect.objectContaining({ status: "rejected" }));
        expect(updateReward).toHaveBeenCalledWith("points-reward", expect.objectContaining({ status: "rejected" }));
    });

    it("reverses settled benefits when an administrator rejects a relationship", async () => {
        const now = "2026-07-27T00:00:00.000Z";
        let relationship = { id: "relationship-one", inviterUserId: "inviter-one", riskStatus: "clear", riskSignals: {} };
        const rewards = [
            {
                id: "points-reward",
                relationshipId: relationship.id,
                beneficiaryUserId: "inviter-one",
                beneficiaryRole: "inviter",
                rewardType: "points",
                pointsAmount: 100,
                triggerOrderId: "order-one",
                status: "settled",
                settleAfter: now,
                createdAt: now,
                updatedAt: now,
            },
            {
                id: "coupon-reward",
                relationshipId: relationship.id,
                beneficiaryUserId: "invitee-one",
                beneficiaryRole: "invitee",
                rewardType: "coupon",
                pointsAmount: 0,
                couponTemplateId: "template-one",
                userCouponId: "coupon-one",
                triggerOrderId: "order-one",
                status: "settled",
                settleAfter: now,
                createdAt: now,
                updatedAt: now,
            },
        ];
        const updateReward = vi.fn(async (id: string, patch: { status?: string }) => ({ id, ...patch }));
        const updateRelationship = vi.fn(async (_id: string, patch: { riskStatus?: string; riskSignals?: unknown }) => {
            relationship = { ...relationship, ...patch } as typeof relationship;
            return relationship;
        });
        const referrals = {
            getRelationshipById: vi.fn(async () => relationship),
            updateRelationship,
            getRewardsByRelationship: vi.fn(async () => rewards),
            updateReward,
        };
        mocks.makeRepositories.mockReturnValue({
            referrals,
            coupons: { getUserCouponById: vi.fn(async () => ({ id: "coupon-one", status: "locked" })) },
        });
        mocks.transaction.mockImplementation(async (handler) => handler({ query: vi.fn() }));
        mocks.adjustPoints.mockResolvedValue({ record: { id: "reversal-record" } });

        await expect(updateReferralRelationshipRisk({ id: relationship.id, riskStatus: "rejected", reason: "异常邀请" })).resolves.toMatchObject({ riskStatus: "rejected" });

        expect(mocks.adjustPoints).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: "inviter-one", amount: -100, idempotencyKey: "referral-reward:points-reward:reversal" }));
        expect(updateReward).toHaveBeenCalledWith("points-reward", expect.objectContaining({ status: "revoked", reversalWalletRecordId: "reversal-record" }));
        expect(updateReward).toHaveBeenCalledWith("coupon-reward", expect.objectContaining({ status: "reversal_pending" }));
        expect(updateRelationship).toHaveBeenLastCalledWith(relationship.id, expect.objectContaining({ riskStatus: "rejected" }));
    });
});
