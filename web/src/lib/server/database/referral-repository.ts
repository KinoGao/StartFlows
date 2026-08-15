import type { QueryExecutor } from "@/lib/server/database/postgres";
import type { JsonValue, PageInput, PageResult, ReferralCodeRecord, ReferralProgramRecord, ReferralRelationshipRecord, ReferralRewardRecord, ReferralRewardStatus, ReferralRiskStatus } from "./repository-shared";
import { jsonParam, mapReferralCode, mapReferralProgram, mapReferralRelationship, mapReferralReward, normalizePage, normalizePageSize, numberValue, pageResult } from "./repository-shared";

export class ReferralRepository {
    constructor(private readonly db: QueryExecutor) {}

    async getProgram(forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM referral_programs WHERE id = 'default'${forUpdate ? " FOR UPDATE" : ""}`);
        return result.rows[0] ? mapReferralProgram(result.rows[0]) : null;
    }

    async upsertProgram(program: ReferralProgramRecord) {
        const result = await this.db.query(
            `
            INSERT INTO referral_programs (
                id, enabled, inviter_points, invitee_reward_type, invitee_points, invitee_coupon_template_id,
                minimum_paid_cents, cooling_off_days, inviter_monthly_limit, campaign_total_limit,
                auto_freeze_risk, created_by_user_id, updated_by_user_id, created_at, updated_at
            ) VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT (id) DO UPDATE SET
                enabled = EXCLUDED.enabled,
                inviter_points = EXCLUDED.inviter_points,
                invitee_reward_type = EXCLUDED.invitee_reward_type,
                invitee_points = EXCLUDED.invitee_points,
                invitee_coupon_template_id = EXCLUDED.invitee_coupon_template_id,
                minimum_paid_cents = EXCLUDED.minimum_paid_cents,
                cooling_off_days = EXCLUDED.cooling_off_days,
                inviter_monthly_limit = EXCLUDED.inviter_monthly_limit,
                campaign_total_limit = EXCLUDED.campaign_total_limit,
                auto_freeze_risk = EXCLUDED.auto_freeze_risk,
                created_by_user_id = coalesce(referral_programs.created_by_user_id, EXCLUDED.created_by_user_id),
                updated_by_user_id = EXCLUDED.updated_by_user_id
            RETURNING *
            `,
            [
                program.enabled,
                program.inviterPoints,
                program.inviteeRewardType,
                program.inviteePoints,
                program.inviteeCouponTemplateId || null,
                program.minimumPaidCents,
                program.coolingOffDays,
                program.inviterMonthlyLimit,
                program.campaignTotalLimit,
                program.autoFreezeRisk,
                program.createdByUserId || null,
                program.updatedByUserId || null,
                program.createdAt,
                program.updatedAt,
            ],
        );
        return mapReferralProgram(result.rows[0]);
    }

    async getCodeByUserId(userId: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM referral_codes WHERE user_id = $1${forUpdate ? " FOR UPDATE" : ""}`, [userId]);
        return result.rows[0] ? mapReferralCode(result.rows[0]) : null;
    }

    async getCodeByCode(code: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM referral_codes WHERE upper(code) = upper($1)${forUpdate ? " FOR UPDATE" : ""}`, [code]);
        return result.rows[0] ? mapReferralCode(result.rows[0]) : null;
    }

    async createCode(code: ReferralCodeRecord) {
        const result = await this.db.query(
            `INSERT INTO referral_codes (id, user_id, code, enabled, click_count, last_clicked_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT DO NOTHING
             RETURNING *`,
            [code.id, code.userId, code.code, code.enabled, code.clickCount, code.lastClickedAt || null, code.createdAt, code.updatedAt],
        );
        return result.rows[0] ? mapReferralCode(result.rows[0]) : null;
    }

    async recordClick(code: string, clickedAt: string) {
        const result = await this.db.query(
            `UPDATE referral_codes SET click_count = click_count + 1, last_clicked_at = $2
             WHERE upper(code) = upper($1) AND enabled = true
             RETURNING *`,
            [code, clickedAt],
        );
        return result.rows[0] ? mapReferralCode(result.rows[0]) : null;
    }

    async createRelationship(relationship: ReferralRelationshipRecord) {
        const result = await this.db.query(
            `
            INSERT INTO referral_relationships (
                id, inviter_user_id, invitee_user_id, referral_code_id, attribution_source, attribution_metadata,
                registration_ip_hash, payment_identity_hash, risk_status, risk_signals, registered_at, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
            `,
            [
                relationship.id,
                relationship.inviterUserId,
                relationship.inviteeUserId,
                relationship.referralCodeId,
                relationship.attributionSource,
                jsonParam(relationship.attributionMetadata),
                relationship.registrationIpHash || null,
                relationship.paymentIdentityHash || null,
                relationship.riskStatus,
                jsonParam(relationship.riskSignals),
                relationship.registeredAt,
                relationship.createdAt,
                relationship.updatedAt,
            ],
        );
        return mapReferralRelationship(result.rows[0]);
    }

    async getRelationshipByInviteeUserId(inviteeUserId: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM referral_relationships WHERE invitee_user_id = $1${forUpdate ? " FOR UPDATE" : ""}`, [inviteeUserId]);
        return result.rows[0] ? mapReferralRelationship(result.rows[0]) : null;
    }

    async getRelationshipById(id: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM referral_relationships WHERE id = $1${forUpdate ? " FOR UPDATE" : ""}`, [id]);
        return result.rows[0] ? mapReferralRelationship(result.rows[0]) : null;
    }

    async hasReverseRelationship(inviterUserId: string, inviteeUserId: string) {
        const result = await this.db.query("SELECT 1 FROM referral_relationships WHERE inviter_user_id = $1 AND invitee_user_id = $2 LIMIT 1", [inviteeUserId, inviterUserId]);
        return Boolean(result.rows[0]);
    }

    async countRecentIpMatches(inviterUserId: string, registrationIpHash: string, since: string) {
        const result = await this.db.query(
            `SELECT count(*) AS total FROM referral_relationships
             WHERE inviter_user_id = $1 AND registration_ip_hash = $2 AND registered_at >= $3`,
            [inviterUserId, registrationIpHash, since],
        );
        return numberValue(result.rows[0]?.total);
    }

    async countPaymentIdentityMatches(paymentIdentityHash: string, excludeInviteeUserId: string) {
        const result = await this.db.query(
            `SELECT count(*) AS total FROM referral_relationships
             WHERE payment_identity_hash = $1 AND invitee_user_id <> $2`,
            [paymentIdentityHash, excludeInviteeUserId],
        );
        return numberValue(result.rows[0]?.total);
    }

    async updateRelationship(id: string, patch: Partial<Pick<ReferralRelationshipRecord, "paymentIdentityHash" | "riskStatus" | "riskSignals" | "attributionMetadata">>) {
        const result = await this.db.query(
            `UPDATE referral_relationships SET
                payment_identity_hash = COALESCE($2, payment_identity_hash),
                risk_status = COALESCE($3, risk_status),
                risk_signals = COALESCE($4::jsonb, risk_signals),
                attribution_metadata = COALESCE($5::jsonb, attribution_metadata)
             WHERE id = $1
             RETURNING *`,
            [id, patch.paymentIdentityHash, patch.riskStatus, jsonParam(patch.riskSignals), jsonParam(patch.attributionMetadata)],
        );
        return result.rows[0] ? mapReferralRelationship(result.rows[0]) : null;
    }

    async listRelationships(input: PageInput & { keyword?: string; riskStatus?: ReferralRiskStatus; inviterUserId?: string; participantUserId?: string } = {}): Promise<PageResult<ReferralRelationshipRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const keyword = input.keyword?.trim().toLowerCase() || "";
        const result = await this.db.query(
            `
            SELECT relationship.*, code.code,
                inviter.username AS inviter_username, inviter.display_name AS inviter_display_name, inviter.account_id AS inviter_account_id,
                invitee.username AS invitee_username, invitee.display_name AS invitee_display_name, invitee.account_id AS invitee_account_id,
                count(*) OVER() AS total_count
            FROM referral_relationships relationship
            JOIN referral_codes code ON code.id = relationship.referral_code_id
            JOIN users inviter ON inviter.id = relationship.inviter_user_id
            JOIN users invitee ON invitee.id = relationship.invitee_user_id
            WHERE ($1 = '' OR lower(inviter.username) LIKE $2 OR lower(inviter.display_name) LIKE $2 OR lpad(inviter.account_id::text, 4, '0') LIKE $2
                   OR lower(invitee.username) LIKE $2 OR lower(invitee.display_name) LIKE $2 OR lpad(invitee.account_id::text, 4, '0') LIKE $2 OR lower(code.code) LIKE $2)
              AND ($3::text IS NULL OR relationship.risk_status = $3)
              AND ($4::text IS NULL OR relationship.inviter_user_id = $4)
              AND ($5::text IS NULL OR relationship.inviter_user_id = $5 OR relationship.invitee_user_id = $5)
            ORDER BY relationship.registered_at DESC
            LIMIT $6 OFFSET $7
            `,
            [keyword, `%${keyword}%`, input.riskStatus || null, input.inviterUserId || null, input.participantUserId || null, pageSize, (page - 1) * pageSize],
        );
        return pageResult(result.rows.map(mapReferralRelationship), numberValue(result.rows[0]?.total_count), page, pageSize);
    }

    async createReward(reward: ReferralRewardRecord) {
        const result = await this.db.query(
            `
            INSERT INTO referral_rewards (
                id, relationship_id, beneficiary_user_id, beneficiary_role, reward_type, points_amount,
                coupon_template_id, trigger_order_id, status, settle_after, wallet_record_id,
                reversal_wallet_record_id, user_coupon_id, reason, settled_at, revoked_at, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            ON CONFLICT (relationship_id, beneficiary_role) DO NOTHING
            RETURNING *
            `,
            [
                reward.id,
                reward.relationshipId,
                reward.beneficiaryUserId,
                reward.beneficiaryRole,
                reward.rewardType,
                reward.pointsAmount,
                reward.couponTemplateId || null,
                reward.triggerOrderId,
                reward.status,
                reward.settleAfter,
                reward.walletRecordId || null,
                reward.reversalWalletRecordId || null,
                reward.userCouponId || null,
                reward.reason || null,
                reward.settledAt || null,
                reward.revokedAt || null,
                reward.createdAt,
                reward.updatedAt,
            ],
        );
        return result.rows[0] ? mapReferralReward(result.rows[0]) : null;
    }

    async getRewardsByRelationship(relationshipId: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM referral_rewards WHERE relationship_id = $1 ORDER BY beneficiary_role${forUpdate ? " FOR UPDATE" : ""}`, [relationshipId]);
        return result.rows.map(mapReferralReward);
    }

    async getRewardsByTriggerOrder(triggerOrderId: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM referral_rewards WHERE trigger_order_id = $1 ORDER BY beneficiary_role${forUpdate ? " FOR UPDATE" : ""}`, [triggerOrderId]);
        return result.rows.map(mapReferralReward);
    }

    async listRewards(input: PageInput & { status?: ReferralRewardStatus; beneficiaryUserId?: string; relationshipId?: string } = {}): Promise<PageResult<ReferralRewardRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const result = await this.db.query(
            `
            SELECT reward.*, user_account.username AS beneficiary_username, user_account.display_name AS beneficiary_display_name,
                user_account.account_id AS beneficiary_account_id,
                count(*) OVER() AS total_count
            FROM referral_rewards reward
            JOIN users user_account ON user_account.id = reward.beneficiary_user_id
            WHERE ($1::text IS NULL OR reward.status = $1)
              AND ($2::text IS NULL OR reward.beneficiary_user_id = $2)
              AND ($3::text IS NULL OR reward.relationship_id = $3)
            ORDER BY reward.created_at DESC
            LIMIT $4 OFFSET $5
            `,
            [input.status || null, input.beneficiaryUserId || null, input.relationshipId || null, pageSize, (page - 1) * pageSize],
        );
        return pageResult(result.rows.map(mapReferralReward), numberValue(result.rows[0]?.total_count), page, pageSize);
    }

    async lockDueRewards(at: string, limit: number) {
        const result = await this.db.query(
            `
            SELECT reward.*
            FROM referral_rewards reward
            JOIN referral_relationships relationship ON relationship.id = reward.relationship_id
            WHERE reward.status = 'pending'
              AND reward.settle_after <= $1
              AND relationship.risk_status = 'clear'
            ORDER BY reward.settle_after ASC, reward.id ASC
            LIMIT $2
            FOR UPDATE OF reward SKIP LOCKED
            `,
            [at, limit],
        );
        return result.rows.map(mapReferralReward);
    }

    async updateReward(id: string, patch: Partial<Pick<ReferralRewardRecord, "status" | "walletRecordId" | "reversalWalletRecordId" | "userCouponId" | "reason" | "settledAt" | "revokedAt">>) {
        const result = await this.db.query(
            `UPDATE referral_rewards SET
                status = COALESCE($2, status),
                wallet_record_id = COALESCE($3, wallet_record_id),
                reversal_wallet_record_id = COALESCE($4, reversal_wallet_record_id),
                user_coupon_id = COALESCE($5, user_coupon_id),
                reason = COALESCE($6, reason),
                settled_at = COALESCE($7, settled_at),
                revoked_at = COALESCE($8, revoked_at)
             WHERE id = $1
             RETURNING *`,
            [id, patch.status, patch.walletRecordId, patch.reversalWalletRecordId, patch.userCouponId, patch.reason, patch.settledAt, patch.revokedAt],
        );
        return result.rows[0] ? mapReferralReward(result.rows[0]) : null;
    }

    async countSettledInviterRewards(inviterUserId: string, monthStart: string, monthEnd: string) {
        const result = await this.db.query(
            `SELECT
                count(*) FILTER (WHERE reward.settled_at >= $2 AND reward.settled_at < $3) AS monthly,
                count(*) AS total
             FROM referral_rewards reward
             JOIN referral_relationships relationship ON relationship.id = reward.relationship_id
             WHERE relationship.inviter_user_id = $1
               AND reward.beneficiary_role = 'inviter'
               AND reward.status = 'settled'`,
            [inviterUserId, monthStart, monthEnd],
        );
        return { monthly: numberValue(result.rows[0]?.monthly), total: numberValue(result.rows[0]?.total) };
    }

    async countAllSettledInviterRewards() {
        const result = await this.db.query("SELECT count(*) AS total FROM referral_rewards WHERE beneficiary_role = 'inviter' AND status = 'settled'");
        return numberValue(result.rows[0]?.total);
    }

    async hasPriorPaidOrder(userId: string, excludeOrderId: string) {
        const result = await this.db.query(
            `SELECT 1 FROM billing_orders
             WHERE user_id = $1 AND id <> $2 AND paid_at IS NOT NULL AND status IN ('paid', 'refunding', 'refunded')
             LIMIT 1`,
            [userId, excludeOrderId],
        );
        return Boolean(result.rows[0]);
    }

    async getUserStats(userId: string) {
        const result = await this.db.query(
            `SELECT
                coalesce(code.click_count, 0) AS clicks,
                (SELECT count(*) FROM referral_relationships relationship WHERE relationship.inviter_user_id = $1) AS registrations,
                (SELECT count(DISTINCT relationship.id) FROM referral_relationships relationship JOIN referral_rewards reward ON reward.relationship_id = relationship.id WHERE relationship.inviter_user_id = $1) AS qualified,
                (SELECT count(*) FROM referral_relationships relationship JOIN referral_rewards reward ON reward.relationship_id = relationship.id WHERE relationship.inviter_user_id = $1 AND reward.beneficiary_role = 'inviter' AND reward.status = 'pending') AS pending,
                (SELECT count(*) FROM referral_relationships relationship JOIN referral_rewards reward ON reward.relationship_id = relationship.id WHERE relationship.inviter_user_id = $1 AND reward.beneficiary_role = 'inviter' AND reward.status = 'settled') AS settled,
                (SELECT count(*) FROM referral_relationships relationship JOIN referral_rewards reward ON reward.relationship_id = relationship.id WHERE relationship.inviter_user_id = $1 AND reward.beneficiary_role = 'inviter' AND reward.status IN ('revoked', 'reversal_pending')) AS revoked
             FROM users user_account
             LEFT JOIN referral_codes code ON code.user_id = user_account.id
             WHERE user_account.id = $1`,
            [userId],
        );
        const row = result.rows[0] || {};
        return { clicks: numberValue(row.clicks), registrations: numberValue(row.registrations), qualified: numberValue(row.qualified), pending: numberValue(row.pending), settled: numberValue(row.settled), revoked: numberValue(row.revoked) };
    }

    async getAdminStats() {
        const result = await this.db.query(
            `SELECT
                (SELECT coalesce(sum(click_count), 0) FROM referral_codes) AS clicks,
                (SELECT count(*) FROM referral_relationships) AS registrations,
                (SELECT count(DISTINCT relationship_id) FROM referral_rewards) AS qualified,
                (SELECT count(*) FROM referral_rewards WHERE beneficiary_role = 'inviter' AND status = 'pending') AS pending,
                (SELECT count(*) FROM referral_rewards WHERE beneficiary_role = 'inviter' AND status = 'settled') AS settled,
                (SELECT count(*) FROM referral_relationships WHERE risk_status IN ('review', 'frozen')) AS risky`,
        );
        const row = result.rows[0] || {};
        return { clicks: numberValue(row.clicks), registrations: numberValue(row.registrations), qualified: numberValue(row.qualified), pending: numberValue(row.pending), settled: numberValue(row.settled), risky: numberValue(row.risky) };
    }
}
