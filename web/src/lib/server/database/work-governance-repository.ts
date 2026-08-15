import type { QueryExecutor } from "@/lib/server/database/postgres";
import type { PageInput, PageResult, PublishedGalleryItemRecord, PublishedWorkCaseRecord, PublishedWorkCaseStatus, PublishedWorkCaseSummaryRecord, PublishedWorkCaseType } from "./repository-shared";
import { jsonParam, mapPublishedGalleryItem, mapPublishedWork, mapPublishedWorkCase, mapPublishedWorkCaseSummary, normalizePage, normalizePageSize, numberValue, pageResult } from "./repository-shared";

export type GallerySort = "random" | "featured" | "latest" | "popular";
export type GalleryCursor = {
    sort: GallerySort;
    featureRank: number;
    featuredAt: string;
    viewCount: number;
    publishedAt: string;
    randomSeed: string;
    randomRank: string;
    id: string;
};

export class WorkGovernanceRepository {
    constructor(private readonly db: QueryExecutor) {}

    async listGallery(input: { limit: number; sort: GallerySort; category?: string; tag?: string; keyword?: string; featuredOnly?: boolean; randomSeed?: string; after?: GalleryCursor }) {
        const limit = Math.max(1, Math.min(48, Math.floor(input.limit || 12)));
        const order = galleryOrder(input.sort);
        const cursor = galleryCursorClause(input.sort);
        const result = await this.db.query(
            `SELECT work.id AS work_id, work.owner_user_id AS author_user_id, work.slug, work.source_type, work.view_count, work.like_count, work.is_featured, work.featured_at,
                    version.id AS version_id, coalesce(version.reviewed_at, version.updated_at) AS published_at,
                    version.title, version.description, version.public_prompt, version.category, version.tags, version.author_display,
                    CASE WHEN version.author_display = 'hidden' THEN NULL ELSE version.author_name END AS author_name,
                    owner.username AS author_username,
                    owner.avatar_storage_key AS owner_avatar_storage_key, owner.updated_at AS owner_avatar_updated_at,
                    preview.id AS asset_id, preview.media_type AS asset_media_type, preview.mime_type AS asset_mime_type
             FROM published_works work
             JOIN published_work_versions version ON version.id = work.published_version_id
             JOIN users owner ON owner.id = work.owner_user_id AND owner.status = 'active'
             LEFT JOIN LATERAL (
                 SELECT asset.id, asset.media_type, asset.mime_type
                 FROM published_work_assets asset
                 WHERE asset.version_id = version.id AND asset.media_type IN ('image', 'video')
                 ORDER BY CASE WHEN asset.role = 'cover' THEN 0 ELSE 1 END, asset.sort_order, asset.id
                 LIMIT 1
             ) preview ON true
             CROSS JOIN (SELECT $6::int AS feature_rank, $7::timestamptz AS featured_at, $8::bigint AS view_count, $9::timestamptz AS published_at, $10::text AS work_id,
                                $11::text AS random_seed, $12::text AS random_rank) gallery_cursor
             WHERE work.lifecycle_status = 'active'
               AND version.moderation_status = 'approved'
               AND version.visibility = 'public'
               AND EXISTS (SELECT 1 FROM published_work_assets visible_asset WHERE visible_asset.version_id = version.id AND visible_asset.role = 'content' AND visible_asset.media_type IN ('image', 'video'))
               AND ($1 = '' OR lower(version.category) = lower($1))
               AND ($2 = '' OR version.tags ? $2)
               AND ($3 = '' OR to_tsvector('simple', coalesce(version.title, '') || ' ' || coalesce(version.description, '') || ' ' || coalesce(version.category, '')) @@ plainto_tsquery('simple', $3) OR lower(version.title) LIKE lower($4))
               AND (NOT $5::boolean OR work.is_featured)
               AND ${cursor}
             ORDER BY ${order}
             LIMIT $13`,
            [
                input.category?.trim() || "",
                input.tag?.trim() || "",
                input.keyword?.trim() || "",
                `${input.keyword?.trim() || ""}%`,
                Boolean(input.featuredOnly),
                input.after?.featureRank ?? null,
                input.after?.featuredAt ?? null,
                input.after?.viewCount ?? null,
                input.after?.publishedAt ?? null,
                input.after?.id ?? null,
                input.randomSeed || "",
                input.after?.randomRank ?? null,
                limit + 1,
            ],
        );
        const mapped = result.rows.map(mapPublishedGalleryItem);
        return { items: mapped.slice(0, limit), hasMore: mapped.length > limit };
    }

    async listSitemapEntries(limit = 5000) {
        const result = await this.db.query(
            `SELECT work.slug, coalesce(version.reviewed_at, version.updated_at) AS updated_at
             FROM published_works work
             JOIN published_work_versions version ON version.id = work.published_version_id
             JOIN users owner ON owner.id = work.owner_user_id AND owner.status = 'active'
             WHERE work.lifecycle_status = 'active' AND version.moderation_status = 'approved' AND version.visibility = 'public'
             ORDER BY coalesce(version.reviewed_at, version.updated_at) DESC, work.id DESC LIMIT $1`,
            [Math.max(1, Math.min(5000, Math.floor(limit)))],
        );
        return result.rows.map((row) => ({ slug: String(row.slug), updatedAt: new Date(String(row.updated_at)).toISOString() }));
    }

    async setFeatured(workId: string, featured: boolean, actorUserId: string, changedAt: string) {
        const result = await this.db.query(
            `UPDATE published_works work SET
                is_featured = $2,
                featured_at = CASE WHEN $2 THEN $4::timestamptz ELSE NULL END,
                featured_by_user_id = CASE WHEN $2 THEN $3 ELSE NULL END
             WHERE work.id = $1
               AND (NOT $2::boolean OR (
                    work.lifecycle_status = 'active' AND EXISTS (
                        SELECT 1 FROM published_work_versions version
                        WHERE version.id = work.published_version_id AND version.moderation_status = 'approved' AND version.visibility = 'public'
                    )
               ))
             RETURNING work.*`,
            [workId, featured, actorUserId, changedAt],
        );
        return result.rows[0] ? mapPublishedWork(result.rows[0]) : null;
    }

    async createCase(record: PublishedWorkCaseRecord) {
        const result = await this.db.query(
            `INSERT INTO published_work_cases (id, work_id, version_id, submitter_user_id, case_type, category, description, status, resolution, handled_by_user_id, handled_at, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
            [
                record.id,
                record.workId,
                record.versionId,
                record.submitterUserId,
                record.caseType,
                record.category,
                record.description,
                record.status,
                record.resolution || null,
                record.handledByUserId || null,
                record.handledAt || null,
                record.createdAt,
                record.updatedAt,
            ],
        );
        return mapPublishedWorkCase(result.rows[0]);
    }

    async getCaseById(id: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM published_work_cases WHERE id = $1${forUpdate ? " FOR UPDATE" : ""}`, [id]);
        return result.rows[0] ? mapPublishedWorkCase(result.rows[0]) : null;
    }

    async listCases(input: PageInput & { caseType?: PublishedWorkCaseType; status?: PublishedWorkCaseStatus; keyword?: string } = {}): Promise<PageResult<PublishedWorkCaseSummaryRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const keyword = input.keyword?.trim().toLowerCase() || "";
        const result = await this.db.query(
            `SELECT cases.*, work.slug, work.owner_user_id, version.title,
                    owner.username AS owner_username, owner.display_name AS owner_display_name, owner.account_id AS owner_account_id,
                    submitter.username AS submitter_username, submitter.display_name AS submitter_display_name, submitter.account_id AS submitter_account_id,
                    count(*) OVER() AS total_count
             FROM published_work_cases cases
             JOIN published_works work ON work.id = cases.work_id
             JOIN published_work_versions version ON version.id = cases.version_id
             JOIN users owner ON owner.id = work.owner_user_id
             JOIN users submitter ON submitter.id = cases.submitter_user_id
             WHERE ($1::text IS NULL OR cases.case_type = $1)
               AND ($2::text IS NULL OR cases.status = $2)
               AND ($3 = '' OR lower(version.title) LIKE $4 OR lower(work.slug) LIKE $4 OR lower(owner.username) LIKE $4 OR lpad(owner.account_id::text, 4, '0') LIKE $4 OR lower(submitter.username) LIKE $4 OR lpad(submitter.account_id::text, 4, '0') LIKE $4)
             ORDER BY CASE WHEN cases.status = 'open' THEN 0 ELSE 1 END, cases.created_at DESC, cases.id DESC
             LIMIT $5 OFFSET $6`,
            [input.caseType || null, input.status || null, keyword, `%${keyword}%`, pageSize, (page - 1) * pageSize],
        );
        return pageResult(result.rows.map(mapPublishedWorkCaseSummary), numberValue(result.rows[0]?.total_count), page, pageSize);
    }

    async listCasesForOwner(workId: string, ownerUserId: string, input: PageInput = {}): Promise<PageResult<PublishedWorkCaseSummaryRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const result = await this.db.query(
            `SELECT cases.*, work.slug, work.owner_user_id, version.title,
                    owner.username AS owner_username, owner.display_name AS owner_display_name,
                    submitter.username AS submitter_username, submitter.display_name AS submitter_display_name,
                    count(*) OVER() AS total_count
             FROM published_work_cases cases
             JOIN published_works work ON work.id = cases.work_id
             JOIN published_work_versions version ON version.id = cases.version_id
             JOIN users owner ON owner.id = work.owner_user_id
             JOIN users submitter ON submitter.id = cases.submitter_user_id
             WHERE cases.work_id = $1 AND work.owner_user_id = $2
               AND cases.case_type = 'appeal' AND cases.submitter_user_id = $2
             ORDER BY cases.created_at DESC, cases.id DESC
             LIMIT $3 OFFSET $4`,
            [workId, ownerUserId, pageSize, (page - 1) * pageSize],
        );
        return pageResult(result.rows.map(mapPublishedWorkCaseSummary), numberValue(result.rows[0]?.total_count), page, pageSize);
    }

    async resolveCase(id: string, input: { status: "approved" | "rejected"; resolution: string; handledByUserId: string; handledAt: string }) {
        const result = await this.db.query(
            `UPDATE published_work_cases SET status = $2, resolution = $3, handled_by_user_id = $4, handled_at = $5
             WHERE id = $1 AND status = 'open' RETURNING *`,
            [id, input.status, input.resolution, input.handledByUserId, input.handledAt],
        );
        return result.rows[0] ? mapPublishedWorkCase(result.rows[0]) : null;
    }
}

function galleryOrder(sort: GallerySort) {
    if (sort === "random") return "md5(work.id || gallery_cursor.random_seed) ASC, work.id ASC";
    if (sort === "popular") return "work.view_count DESC, coalesce(version.reviewed_at, version.updated_at) DESC, work.id DESC";
    if (sort === "latest") return "coalesce(version.reviewed_at, version.updated_at) DESC, work.id DESC";
    return "work.is_featured DESC, coalesce(work.featured_at, to_timestamp(0)) DESC, coalesce(version.reviewed_at, version.updated_at) DESC, work.id DESC";
}

function galleryCursorClause(sort: GallerySort) {
    if (sort === "random") return "(gallery_cursor.work_id IS NULL OR (md5(work.id || gallery_cursor.random_seed), work.id) > (gallery_cursor.random_rank, gallery_cursor.work_id))";
    if (sort === "popular") return "(gallery_cursor.work_id IS NULL OR (work.view_count, coalesce(version.reviewed_at, version.updated_at), work.id) < (gallery_cursor.view_count, gallery_cursor.published_at, gallery_cursor.work_id))";
    if (sort === "latest") return "(gallery_cursor.work_id IS NULL OR (coalesce(version.reviewed_at, version.updated_at), work.id) < (gallery_cursor.published_at, gallery_cursor.work_id))";
    return "(gallery_cursor.work_id IS NULL OR ((CASE WHEN work.is_featured THEN 1 ELSE 0 END), coalesce(work.featured_at, to_timestamp(0)), coalesce(version.reviewed_at, version.updated_at), work.id) < (gallery_cursor.feature_rank, gallery_cursor.featured_at, gallery_cursor.published_at, gallery_cursor.work_id))";
}
