import type { QueryExecutor } from "@/lib/server/database/postgres";
import type {
    JsonValue,
    PageInput,
    PageResult,
    PublishedWorkAssetRecord,
    PublishedWorkLifecycleStatus,
    PublishedWorkModerationStatus,
    PublishedWorkRecord,
    PublishedWorkSourceType,
    PublishedWorkSummaryRecord,
    PublishedWorkVersionRecord,
} from "./repository-shared";
import { jsonParam, mapPublishedWork, mapPublishedWorkAsset, mapPublishedWorkSummary, mapPublishedWorkVersion, normalizePage, normalizePageSize, numberValue, pageResult } from "./repository-shared";

export type WorkPublicationSourceSummaryRecord = {
    id: string;
    title: string;
    kind?: "image" | "video";
    updatedAt: string;
};

export class WorkPublicationRepository {
    constructor(private readonly db: QueryExecutor) {}

    async createWork(work: PublishedWorkRecord) {
        const result = await this.db.query(
            `INSERT INTO published_works (
                id, owner_user_id, slug, source_type, source_id, lifecycle_status, current_version_id,
                published_version_id, view_count, last_viewed_at, revoked_at, created_at, updated_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             RETURNING *`,
            [
                work.id,
                work.ownerUserId,
                work.slug,
                work.sourceType,
                work.sourceId,
                work.lifecycleStatus,
                work.currentVersionId || null,
                work.publishedVersionId || null,
                work.viewCount,
                work.lastViewedAt || null,
                work.revokedAt || null,
                work.createdAt,
                work.updatedAt,
            ],
        );
        return mapPublishedWork(result.rows[0]);
    }

    async getWorkById(id: string, ownerUserId?: string, forUpdate = false) {
        const result = await this.db.query(
            `SELECT work.*, owner.username AS owner_username, owner.display_name AS owner_display_name FROM published_works work JOIN users owner ON owner.id = work.owner_user_id WHERE work.id = $1 AND ($2::text IS NULL OR work.owner_user_id = $2)${forUpdate ? " FOR UPDATE OF work" : ""}`,
            [id, ownerUserId || null],
        );
        return result.rows[0] ? mapPublishedWork(result.rows[0]) : null;
    }

    async getWorkBySlug(slug: string, forUpdate = false) {
        const result = await this.db.query(
            `SELECT work.*, owner.username AS owner_username, owner.display_name AS owner_display_name FROM published_works work JOIN users owner ON owner.id = work.owner_user_id WHERE lower(work.slug) = lower($1)${forUpdate ? " FOR UPDATE OF work" : ""}`,
            [slug],
        );
        return result.rows[0] ? mapPublishedWork(result.rows[0]) : null;
    }

    async getWorkSummaryById(id: string, ownerUserId?: string) {
        const result = await this.db.query(
            `SELECT work.*, owner.username AS owner_username, owner.display_name AS owner_display_name, owner.account_id AS owner_account_id,
                ${versionProjection("current_version", "current")},
                ${versionProjection("published_version", "published")}
             FROM published_works work
             JOIN users owner ON owner.id = work.owner_user_id
             LEFT JOIN published_work_versions current_version ON current_version.id = work.current_version_id
             LEFT JOIN published_work_versions published_version ON published_version.id = work.published_version_id
             WHERE work.id = $1 AND ($2::text IS NULL OR work.owner_user_id = $2)`,
            [id, ownerUserId || null],
        );
        return result.rows[0] ? mapPublishedWorkSummary(result.rows[0]) : null;
    }

    async listWorks(
        input: PageInput & { ownerUserId?: string; moderationStatus?: PublishedWorkModerationStatus; lifecycleStatus?: PublishedWorkLifecycleStatus; userStatus?: "taken_down"; keyword?: string } = {},
    ): Promise<PageResult<PublishedWorkSummaryRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const keyword = input.keyword?.trim().toLowerCase() || "";
        const result = await this.db.query(
            `SELECT work.*, owner.username AS owner_username, owner.display_name AS owner_display_name, owner.account_id AS owner_account_id,
                 ${versionProjection("current_version", "current")},
                 ${versionProjection("published_version", "published")},
                 preview.id AS current_preview_id, preview.version_id AS current_preview_version_id,
                 preview.storage_key AS current_preview_storage_key, preview.media_type AS current_preview_media_type,
                 preview.mime_type AS current_preview_mime_type, preview.role AS current_preview_role,
                 preview.sort_order AS current_preview_sort_order, preview.metadata AS current_preview_metadata,
                 preview.created_at AS current_preview_created_at,
                 count(*) OVER() AS total_count
             FROM published_works work
             JOIN users owner ON owner.id = work.owner_user_id
             LEFT JOIN published_work_versions current_version ON current_version.id = work.current_version_id
             LEFT JOIN published_work_versions published_version ON published_version.id = work.published_version_id
             LEFT JOIN LATERAL (
                 SELECT asset.* FROM published_work_assets asset
                 WHERE asset.version_id = current_version.id
                 ORDER BY CASE WHEN asset.role = 'cover' THEN 0 ELSE 1 END, asset.sort_order, asset.id
                 LIMIT 1
             ) preview ON true
             WHERE ($1::text IS NULL OR work.owner_user_id = $1)
               AND ($2::text IS NULL OR current_version.moderation_status = $2)
               AND ($3::text IS NULL OR work.lifecycle_status = $3)
               AND ($4 = '' OR lower(current_version.title) LIKE $5 OR lower(owner.username) LIKE $5 OR lower(owner.display_name) LIKE $5 OR lpad(owner.account_id::text, 4, '0') LIKE $5 OR lower(work.slug) LIKE $5)
               AND ($6::text IS NULL OR ($6 = 'taken_down' AND (work.lifecycle_status = 'revoked' OR current_version.moderation_status = 'taken_down')))
             ORDER BY work.updated_at DESC, work.id DESC
             LIMIT $7 OFFSET $8`,
            [input.ownerUserId || null, input.moderationStatus || null, input.lifecycleStatus || null, keyword, `%${keyword}%`, input.userStatus || null, pageSize, (page - 1) * pageSize],
        );
        return pageResult(result.rows.map(mapPublishedWorkSummary), numberValue(result.rows[0]?.total_count), page, pageSize);
    }

    async createVersion(version: PublishedWorkVersionRecord) {
        const result = await this.db.query(
            `INSERT INTO published_work_versions (
                id, work_id, version_number, title, description, public_prompt, category, tags, visibility, author_display,
                author_name, moderation_status, rejection_reason, submitted_at, reviewed_at,
                reviewed_by_user_id, moderation_provider, moderation_signal, created_at, updated_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20)
             RETURNING *`,
            [
                version.id,
                version.workId,
                version.versionNumber,
                version.title,
                version.description,
                version.publicPrompt,
                version.category,
                JSON.stringify(version.tags),
                version.visibility,
                version.authorDisplay,
                version.authorName || null,
                version.moderationStatus,
                version.rejectionReason || null,
                version.submittedAt || null,
                version.reviewedAt || null,
                version.reviewedByUserId || null,
                version.moderationProvider || null,
                version.moderationSignal === undefined ? null : jsonParam(version.moderationSignal),
                version.createdAt,
                version.updatedAt,
            ],
        );
        return mapPublishedWorkVersion(result.rows[0]);
    }

    async getVersionById(id: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM published_work_versions WHERE id = $1${forUpdate ? " FOR UPDATE" : ""}`, [id]);
        return result.rows[0] ? mapPublishedWorkVersion(result.rows[0]) : null;
    }

    async listVersionsByWork(workId: string) {
        const result = await this.db.query("SELECT * FROM published_work_versions WHERE work_id = $1 ORDER BY version_number ASC, id ASC", [workId]);
        return result.rows.map((row) => mapPublishedWorkVersion(row));
    }

    async getLatestApprovedPublicVersion(workId: string, forUpdate = false) {
        const result = await this.db.query(
            `SELECT * FROM published_work_versions
             WHERE work_id = $1 AND moderation_status = 'approved' AND visibility IN ('unlisted', 'public')
             ORDER BY reviewed_at DESC NULLS LAST, version_number DESC
             LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
            [workId],
        );
        return result.rows[0] ? mapPublishedWorkVersion(result.rows[0]) : null;
    }

    async getNextVersionNumber(workId: string) {
        const result = await this.db.query("SELECT coalesce(max(version_number), 0) + 1 AS next_version_number FROM published_work_versions WHERE work_id = $1", [workId]);
        return Math.max(1, numberValue(result.rows[0]?.next_version_number));
    }

    async updateDraftVersion(version: PublishedWorkVersionRecord) {
        const result = await this.db.query(
            `UPDATE published_work_versions SET
                title = $2, description = $3, public_prompt = $4, category = $5, tags = $6::jsonb, visibility = $7,
                author_display = $8, author_name = $9, moderation_status = 'draft', rejection_reason = NULL,
                submitted_at = NULL, reviewed_at = NULL, reviewed_by_user_id = NULL,
                moderation_provider = NULL, moderation_signal = NULL
             WHERE id = $1 AND moderation_status IN ('draft', 'rejected')
             RETURNING *`,
            [version.id, version.title, version.description, version.publicPrompt, version.category, JSON.stringify(version.tags), version.visibility, version.authorDisplay, version.authorName || null],
        );
        return result.rows[0] ? mapPublishedWorkVersion(result.rows[0]) : null;
    }

    async submitVersion(id: string, submittedAt: string) {
        const result = await this.db.query(
            `UPDATE published_work_versions SET moderation_status = 'pending', rejection_reason = NULL, submitted_at = $2, reviewed_at = NULL, reviewed_by_user_id = NULL
             WHERE id = $1 AND moderation_status IN ('draft', 'rejected')
             RETURNING *`,
            [id, submittedAt],
        );
        return result.rows[0] ? mapPublishedWorkVersion(result.rows[0]) : null;
    }

    async setModerationSignal(id: string, provider: string, signal: JsonValue) {
        const result = await this.db.query("UPDATE published_work_versions SET moderation_provider = $2, moderation_signal = $3::jsonb WHERE id = $1 AND moderation_status IN ('draft', 'rejected') RETURNING *", [id, provider, jsonParam(signal)]);
        return result.rows[0] ? mapPublishedWorkVersion(result.rows[0]) : null;
    }

    async reviewVersion(id: string, input: { status: "approved" | "rejected" | "taken_down"; reason?: string; reviewedAt: string; reviewedByUserId: string }) {
        const result = await this.db.query(
            `UPDATE published_work_versions SET moderation_status = $2, rejection_reason = $3, reviewed_at = $4, reviewed_by_user_id = $5
             WHERE id = $1 AND moderation_status ${input.status === "taken_down" ? "= 'approved'" : "= 'pending'"}
             RETURNING *`,
            [id, input.status, input.reason || null, input.reviewedAt, input.reviewedByUserId],
        );
        return result.rows[0] ? mapPublishedWorkVersion(result.rows[0]) : null;
    }

    async restoreVersion(id: string, reviewedAt: string, reviewedByUserId: string) {
        const result = await this.db.query("UPDATE published_work_versions SET moderation_status = 'approved', rejection_reason = NULL, reviewed_at = $2, reviewed_by_user_id = $3 WHERE id = $1 AND moderation_status = 'taken_down' RETURNING *", [
            id,
            reviewedAt,
            reviewedByUserId,
        ]);
        return result.rows[0] ? mapPublishedWorkVersion(result.rows[0]) : null;
    }

    async replaceVersionAssets(versionId: string, assets: PublishedWorkAssetRecord[]) {
        await this.db.query("DELETE FROM published_work_assets WHERE version_id = $1", [versionId]);
        const saved: PublishedWorkAssetRecord[] = [];
        for (const asset of assets) {
            const result = await this.db.query(
                `INSERT INTO published_work_assets (id, version_id, storage_key, media_type, mime_type, role, sort_order, metadata, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
                 RETURNING *`,
                [asset.id, versionId, asset.storageKey, asset.mediaType, asset.mimeType, asset.role, asset.sortOrder, jsonParam(asset.metadata), asset.createdAt],
            );
            saved.push(mapPublishedWorkAsset(result.rows[0]));
        }
        return saved;
    }

    async listVersionAssets(versionId: string) {
        const result = await this.db.query("SELECT * FROM published_work_assets WHERE version_id = $1 ORDER BY CASE WHEN role = 'cover' THEN 0 ELSE 1 END, sort_order, id", [versionId]);
        return result.rows.map((row) => mapPublishedWorkAsset(row));
    }

    async setCurrentVersion(workId: string, versionId: string) {
        const result = await this.db.query(
            `UPDATE published_works SET current_version_id = $2
             WHERE id = $1 AND EXISTS (SELECT 1 FROM published_work_versions version WHERE version.id = $2 AND version.work_id = $1)
             RETURNING *`,
            [workId, versionId],
        );
        return result.rows[0] ? mapPublishedWork(result.rows[0]) : null;
    }

    async setPublishedVersion(workId: string, versionId: string) {
        const result = await this.db.query(
            `UPDATE published_works SET published_version_id = $2, is_featured = false, featured_at = NULL, featured_by_user_id = NULL
             WHERE id = $1 AND lifecycle_status = 'active'
               AND EXISTS (
                   SELECT 1 FROM published_work_versions version
                   WHERE version.id = $2 AND version.work_id = $1 AND version.moderation_status = 'approved'
               )
             RETURNING *`,
            [workId, versionId],
        );
        return result.rows[0] ? mapPublishedWork(result.rows[0]) : null;
    }

    async clearPublishedVersion(workId: string) {
        const result = await this.db.query("UPDATE published_works SET published_version_id = NULL, is_featured = false, featured_at = NULL, featured_by_user_id = NULL WHERE id = $1 RETURNING *", [workId]);
        return result.rows[0] ? mapPublishedWork(result.rows[0]) : null;
    }

    async revokeWork(workId: string, revokedAt: string) {
        const result = await this.db.query(
            "UPDATE published_works SET lifecycle_status = 'revoked', published_version_id = NULL, is_featured = false, featured_at = NULL, featured_by_user_id = NULL, revoked_at = $2 WHERE id = $1 AND lifecycle_status = 'active' RETURNING *",
            [workId, revokedAt],
        );
        return result.rows[0] ? mapPublishedWork(result.rows[0]) : null;
    }

    async relistWork(workId: string, versionId: string) {
        const result = await this.db.query(
            `UPDATE published_works work
             SET lifecycle_status = 'active', published_version_id = $2, revoked_at = NULL,
                 is_featured = false, featured_at = NULL, featured_by_user_id = NULL
             WHERE work.id = $1 AND work.lifecycle_status = 'revoked'
               AND EXISTS (
                   SELECT 1 FROM published_work_versions version
                   WHERE version.id = $2 AND version.work_id = work.id
                     AND version.moderation_status = 'approved'
                     AND version.visibility IN ('unlisted', 'public')
               )
             RETURNING work.*`,
            [workId, versionId],
        );
        return result.rows[0] ? mapPublishedWork(result.rows[0]) : null;
    }

    async hasTakenDownVersion(workId: string) {
        const result = await this.db.query("SELECT EXISTS (SELECT 1 FROM published_work_versions WHERE work_id = $1 AND moderation_status = 'taken_down') AS present", [workId]);
        return result.rows[0]?.present === true;
    }

    async deleteWorkCompletely(workId: string) {
        await this.db.query("DELETE FROM user_notifications WHERE work_id = $1", [workId]);
        await this.db.query("DELETE FROM published_work_cases WHERE work_id = $1", [workId]);
        await this.db.query("DELETE FROM published_work_assets WHERE version_id IN (SELECT id FROM published_work_versions WHERE work_id = $1)", [workId]);
        await this.db.query("DELETE FROM published_work_likes WHERE work_id = $1", [workId]);
        await this.db.query("UPDATE published_works SET current_version_id = NULL, published_version_id = NULL WHERE id = $1", [workId]);
        await this.db.query("DELETE FROM published_work_versions WHERE work_id = $1", [workId]);
        const result = await this.db.query("DELETE FROM published_works WHERE id = $1 RETURNING id", [workId]);
        return result.rows[0] ? String(result.rows[0].id) : null;
    }

    async getPublicWork(slug: string) {
        const result = await this.db.query(
            `SELECT work.*, owner.username AS owner_username, owner.display_name AS owner_display_name,
                owner.avatar_storage_key AS owner_avatar_storage_key, owner.updated_at AS owner_avatar_updated_at,
                ${versionProjection("published_version", "published")}
             FROM published_works work
             JOIN users owner ON owner.id = work.owner_user_id
             JOIN published_work_versions published_version ON published_version.id = work.published_version_id
             WHERE lower(work.slug) = lower($1)
               AND work.lifecycle_status = 'active'
               AND owner.status = 'active'
               AND published_version.moderation_status = 'approved'
               AND published_version.visibility IN ('unlisted', 'public')`,
            [slug],
        );
        if (!result.rows[0]) return null;
        const work = mapPublishedWorkSummary(result.rows[0]);
        return work.publishedVersion ? { ...work, assets: await this.listVersionAssets(work.publishedVersion.id) } : null;
    }

    async getPublicAsset(slug: string, assetId: string) {
        const result = await this.db.query(
            `SELECT asset.*
             FROM published_works work
             JOIN published_work_versions version ON version.id = work.published_version_id
             JOIN published_work_assets asset ON asset.version_id = version.id
             WHERE lower(work.slug) = lower($1) AND asset.id = $2
               AND work.lifecycle_status = 'active'
               AND EXISTS (SELECT 1 FROM users owner WHERE owner.id = work.owner_user_id AND owner.status = 'active')
               AND version.moderation_status = 'approved'
               AND version.visibility IN ('unlisted', 'public')`,
            [slug, assetId],
        );
        return result.rows[0] ? mapPublishedWorkAsset(result.rows[0]) : null;
    }

    async incrementView(workId: string, viewedAt: string) {
        const result = await this.db.query("UPDATE published_works SET view_count = view_count + 1, last_viewed_at = $2 WHERE id = $1 AND lifecycle_status = 'active' RETURNING view_count", [workId, viewedAt]);
        return numberValue(result.rows[0]?.view_count);
    }

    async listSourceSummaries(userId: string, input: PageInput & { sourceType: PublishedWorkSourceType; keyword?: string }): Promise<PageResult<WorkPublicationSourceSummaryRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const keyword = input.keyword?.trim().toLowerCase() || "";
        const table = input.sourceType === "media" ? "library_assets" : input.sourceType === "canvas" ? "canvas_projects" : "drama_projects";
        const kindProjection = input.sourceType === "media" ? "kind" : "NULL::text AS kind";
        const mediaFilter = input.sourceType === "media" ? "AND kind IN ('image', 'video')" : "";
        const result = await this.db.query(
            `SELECT id, title, ${kindProjection}, updated_at, count(*) OVER() AS total_count
             FROM ${table}
             WHERE user_id = $1 ${mediaFilter}
               AND ($2 = '' OR position($2 in lower(title)) > 0)
             ORDER BY updated_at DESC, id DESC
             LIMIT $3 OFFSET $4`,
            [userId, keyword, pageSize, (page - 1) * pageSize],
        );
        return pageResult(
            result.rows.map((row) => ({
                id: String(row.id),
                title: String(row.title),
                kind: row.kind === "image" || row.kind === "video" ? row.kind : undefined,
                updatedAt: String(row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at),
            })),
            numberValue(result.rows[0]?.total_count),
            page,
            pageSize,
        );
    }

    async getSourceJson(userId: string, sourceType: PublishedWorkSourceType, sourceId: string): Promise<{ title: string; value: JsonValue } | null> {
        const table = sourceType === "media" ? "library_assets" : sourceType === "canvas" ? "canvas_projects" : "drama_projects";
        const jsonColumn = sourceType === "media" ? "asset_json" : "project_json";
        const result = await this.db.query(`SELECT title, ${jsonColumn} AS source_json FROM ${table} WHERE id = $1 AND user_id = $2`, [sourceId, userId]);
        return result.rows[0] ? { title: String(result.rows[0].title || ""), value: (result.rows[0].source_json || {}) as JsonValue } : null;
    }
}

function versionProjection(alias: string, prefix: string) {
    return [
        "id",
        "work_id",
        "version_number",
        "title",
        "description",
        "public_prompt",
        "category",
        "tags",
        "visibility",
        "author_display",
        "author_name",
        "moderation_status",
        "rejection_reason",
        "submitted_at",
        "reviewed_at",
        "reviewed_by_user_id",
        "moderation_provider",
        "moderation_signal",
        "created_at",
        "updated_at",
    ]
        .map((column) => `${alias}.${column} AS ${prefix}_${column}`)
        .join(", ");
}
