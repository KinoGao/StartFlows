import type { QueryExecutor } from "@/lib/server/database/postgres";

import type { DailyPlanPointWalletRecord } from "./repository-shared";
import { mapDailyPlanPointWallet } from "./repository-record-mappers";

export class PointsWalletRepository {
    constructor(private readonly db: QueryExecutor) {}

    async getDailyWallet(userId: string, date: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM daily_plan_point_wallets WHERE user_id = $1 AND date = $2${forUpdate ? " FOR UPDATE" : ""}`, [userId, date]);
        return result.rows[0] ? mapDailyPlanPointWallet(result.rows[0]) : null;
    }

    async createDailyWallet(wallet: DailyPlanPointWalletRecord) {
        const result = await this.db.query(
            `INSERT INTO daily_plan_point_wallets (user_id, date, plan_id, assignment_id, granted_points, remaining_points, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (user_id, date) DO NOTHING
             RETURNING *`,
            [wallet.userId, wallet.date, wallet.planId, wallet.assignmentId || null, wallet.grantedPoints, wallet.remainingPoints, wallet.createdAt, wallet.updatedAt],
        );
        return result.rows[0] ? mapDailyPlanPointWallet(result.rows[0]) : this.getDailyWallet(wallet.userId, wallet.date, true);
    }

    async updateRemaining(userId: string, date: string, remainingPoints: number) {
        const result = await this.db.query(
            `UPDATE daily_plan_point_wallets
             SET remaining_points = $3::numeric
             WHERE user_id = $1 AND date = $2 AND $3::numeric >= 0::numeric AND $3::numeric <= granted_points
             RETURNING *`,
            [userId, date, remainingPoints],
        );
        return result.rows[0] ? mapDailyPlanPointWallet(result.rows[0]) : null;
    }

    async replaceDailyGrant(wallet: DailyPlanPointWalletRecord) {
        const result = await this.db.query(
            `UPDATE daily_plan_point_wallets
             SET plan_id = $3, assignment_id = $4, granted_points = $5, remaining_points = $6
             WHERE user_id = $1 AND date = $2
             RETURNING *`,
            [wallet.userId, wallet.date, wallet.planId, wallet.assignmentId || null, wallet.grantedPoints, wallet.remainingPoints],
        );
        return result.rows[0] ? mapDailyPlanPointWallet(result.rows[0]) : null;
    }
}
