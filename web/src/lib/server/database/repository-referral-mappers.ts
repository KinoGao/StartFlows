import type { ReferralCodeRecord, ReferralProgramRecord, ReferralRelationshipRecord, ReferralRewardRecord } from "./repository-types";
import { formatAccountId } from "@/lib/account-id";
import { isoValue, jsonValue, numberValue, optionalIso, optionalString, stringValue } from "./repository-utils";

export function mapReferralProgram(row: Record<string, unknown>): ReferralProgramRecord {
    return {
        id: "default",
        enabled: row.enabled === true,
        inviterPoints: numberValue(row.inviter_points),
        inviteeRewardType: row.invitee_reward_type === "coupon" ? "coupon" : "points",
        inviteePoints: numberValue(row.invitee_points),
        inviteeCouponTemplateId: optionalString(row.invitee_coupon_template_id),
        minimumPaidCents: numberValue(row.minimum_paid_cents),
        coolingOffDays: numberValue(row.cooling_off_days),
        inviterMonthlyLimit: numberValue(row.inviter_monthly_limit),
        campaignTotalLimit: numberValue(row.campaign_total_limit),
        autoFreezeRisk: row.auto_freeze_risk !== false,
        createdByUserId: optionalString(row.created_by_user_id),
        updatedByUserId: optionalString(row.updated_by_user_id),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}

export function mapReferralCode(row: Record<string, unknown>): ReferralCodeRecord {
    return {
        id: stringValue(row.id),
        userId: stringValue(row.user_id),
        code: stringValue(row.code),
        enabled: row.enabled !== false,
        clickCount: numberValue(row.click_count),
        lastClickedAt: optionalIso(row.last_clicked_at),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}

export function mapReferralRelationship(row: Record<string, unknown>): ReferralRelationshipRecord {
    const riskStatus = row.risk_status;
    return {
        id: stringValue(row.id),
        inviterUserId: stringValue(row.inviter_user_id),
        inviteeUserId: stringValue(row.invitee_user_id),
        referralCodeId: stringValue(row.referral_code_id),
        attributionSource: stringValue(row.attribution_source),
        attributionMetadata: jsonValue(row.attribution_metadata),
        registrationIpHash: optionalString(row.registration_ip_hash),
        paymentIdentityHash: optionalString(row.payment_identity_hash),
        riskStatus: riskStatus === "review" || riskStatus === "frozen" || riskStatus === "rejected" ? riskStatus : "clear",
        riskSignals: jsonValue(row.risk_signals),
        registeredAt: isoValue(row.registered_at),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
        code: optionalString(row.code),
        inviterUsername: optionalString(row.inviter_username),
        inviterDisplayName: optionalString(row.inviter_display_name),
        inviterAccountId: row.inviter_account_id === undefined || row.inviter_account_id === null ? undefined : formatAccountId(row.inviter_account_id),
        inviteeUsername: optionalString(row.invitee_username),
        inviteeDisplayName: optionalString(row.invitee_display_name),
        inviteeAccountId: row.invitee_account_id === undefined || row.invitee_account_id === null ? undefined : formatAccountId(row.invitee_account_id),
    };
}

export function mapReferralReward(row: Record<string, unknown>): ReferralRewardRecord {
    const status = row.status;
    return {
        id: stringValue(row.id),
        relationshipId: stringValue(row.relationship_id),
        beneficiaryUserId: stringValue(row.beneficiary_user_id),
        beneficiaryRole: row.beneficiary_role === "invitee" ? "invitee" : "inviter",
        rewardType: row.reward_type === "coupon" ? "coupon" : "points",
        pointsAmount: numberValue(row.points_amount),
        couponTemplateId: optionalString(row.coupon_template_id),
        triggerOrderId: stringValue(row.trigger_order_id),
        status: status === "settled" || status === "revoked" || status === "rejected" || status === "reversal_pending" ? status : "pending",
        settleAfter: isoValue(row.settle_after),
        walletRecordId: optionalString(row.wallet_record_id),
        reversalWalletRecordId: optionalString(row.reversal_wallet_record_id),
        userCouponId: optionalString(row.user_coupon_id),
        reason: optionalString(row.reason),
        settledAt: optionalIso(row.settled_at),
        revokedAt: optionalIso(row.revoked_at),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
        beneficiaryUsername: optionalString(row.beneficiary_username),
        beneficiaryDisplayName: optionalString(row.beneficiary_display_name),
        beneficiaryAccountId: row.beneficiary_account_id === undefined || row.beneficiary_account_id === null ? undefined : formatAccountId(row.beneficiary_account_id),
    };
}
