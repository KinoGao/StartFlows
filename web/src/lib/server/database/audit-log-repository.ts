import type { QueryExecutor } from "@/lib/server/database/postgres";
import type { AuditLogRecord, AuditStatus, PageInput, PageResult } from "./repository-shared";
import { jsonParam, mapAuditLog, normalizePage, normalizePageSize, pageResult } from "./repository-shared";

export class AuditLogsRepository {
    constructor(private readonly db: QueryExecutor) {}

    async create(log: AuditLogRecord) {
        const result = await this.db.query(
            `
            INSERT INTO audit_logs (
                id, action, status, actor_user_id, actor_username, actor_role, actor_ip, actor_user_agent,
                target_type, target_id, target_label, metadata, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
            `,
            [
                log.id,
                log.action,
                log.status,
                log.actorUserId || null,
                log.actorUsername || null,
                log.actorRole || null,
                log.actorIp || null,
                log.actorUserAgent || null,
                log.targetType || null,
                log.targetId || null,
                log.targetLabel || null,
                jsonParam(log.metadata),
                log.createdAt,
            ],
        );
        return mapAuditLog(result.rows[0]);
    }

    async list(input: PageInput & { keyword?: string; action?: string; status?: AuditStatus; actorUserId?: string; targetType?: string } = {}): Promise<PageResult<AuditLogRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const keyword = input.keyword?.trim().toLowerCase() || "";
        const result = await this.db.query(
            `
            SELECT *, count(*) OVER() AS total_count
            FROM audit_logs
            WHERE ($1 = '' OR lower(action) LIKE $2 OR lower(coalesce(actor_username, '')) LIKE $2 OR lower(coalesce(actor_ip, '')) LIKE $2 OR lower(coalesce(target_label, '')) LIKE $2)
              AND ($3::text IS NULL OR action = $3)
              AND ($4::text IS NULL OR status = $4)
              AND ($5::text IS NULL OR actor_user_id = $5)
              AND ($6::text IS NULL OR target_type = $6)
            ORDER BY created_at DESC
            LIMIT $7 OFFSET $8
            `,
            [keyword, `%${keyword}%`, input.action || null, input.status || null, input.actorUserId || null, input.targetType || null, pageSize, (page - 1) * pageSize],
        );
        return pageResult(result.rows.map(mapAuditLog), Number(result.rows[0]?.total_count || 0), page, pageSize);
    }
}
