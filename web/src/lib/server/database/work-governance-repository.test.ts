import { describe, expect, it, vi } from "vitest";

import { WorkGovernanceRepository } from "./work-governance-repository";

describe("WorkGovernanceRepository", () => {
    it("uses bounded keyset gallery queries against the current public version", async () => {
        const rows = Array.from({ length: 13 }, (_, index) => ({
            work_id: `work-${index}`,
            version_id: `version-${index}`,
            slug: `public-work-${index}`,
            source_type: "media",
            view_count: index,
            is_featured: index === 0,
            featured_at: index === 0 ? "2026-07-27T00:00:00.000Z" : null,
            published_at: "2026-07-27T00:00:00.000Z",
            title: `作品 ${index}`,
            description: "说明",
            category: "插画",
            tags: ["原创"],
            author_name: "作者",
            asset_id: `asset-${index}`,
            asset_media_type: "image",
            asset_mime_type: "image/png",
        }));
        const query = vi.fn().mockResolvedValue({ rows });
        const repository = new WorkGovernanceRepository({ query });

        const result = await repository.listGallery({ limit: 12, sort: "featured", category: "插画", tag: "原创" });
        const [sql, values] = query.mock.calls[0] as [string, unknown[]];

        expect(sql).toContain("version.id = work.published_version_id");
        expect(sql).toContain("version.visibility = 'public'");
        expect(sql).toContain("LIMIT $13");
        expect(sql).not.toContain("OFFSET");
        expect(values[12]).toBe(13);
        expect(result.items).toHaveLength(12);
        expect(result.hasMore).toBe(true);
    });

    it("uses a stable seeded order for random gallery pagination", async () => {
        const query = vi.fn().mockResolvedValue({ rows: [] });
        const repository = new WorkGovernanceRepository({ query });

        await repository.listGallery({
            limit: 12,
            sort: "random",
            randomSeed: "seed-one",
            after: {
                sort: "random",
                featureRank: 0,
                featuredAt: "1970-01-01T00:00:00.000Z",
                viewCount: 0,
                publishedAt: "1970-01-01T00:00:00.000Z",
                randomSeed: "seed-one",
                randomRank: "0123456789abcdef0123456789abcdef",
                id: "work-one",
            },
        });
        const [sql, values] = query.mock.calls[0] as [string, unknown[]];

        expect(sql).toContain("md5(work.id || gallery_cursor.random_seed)");
        expect(sql).toContain("gallery_cursor.random_rank");
        expect(values[10]).toBe("seed-one");
        expect(values[11]).toBe("0123456789abcdef0123456789abcdef");
    });

    it("only features active approved public versions", async () => {
        const query = vi.fn().mockResolvedValue({ rows: [] });
        const repository = new WorkGovernanceRepository({ query });

        await repository.setFeatured("work-one", true, "admin-one", "2026-07-27T00:00:00.000Z");
        const sql = query.mock.calls[0]?.[0] as string;

        expect(sql).toContain("work.lifecycle_status = 'active'");
        expect(sql).toContain("version.moderation_status = 'approved'");
        expect(sql).toContain("version.visibility = 'public'");
    });

    it("searches governance cases by padded author and submitter account ids", async () => {
        const query = vi.fn().mockResolvedValue({ rows: [] });
        const repository = new WorkGovernanceRepository({ query });

        await repository.listCases({ keyword: "0001", page: 1, pageSize: 20 });
        const sql = String(query.mock.calls[0]?.[0]);

        expect(sql).toContain("lpad(owner.account_id::text, 4, '0') LIKE $4");
        expect(sql).toContain("lpad(submitter.account_id::text, 4, '0') LIKE $4");
    });

    it("pages only the owner's own appeals without exposing report cases", async () => {
        const query = vi.fn().mockResolvedValue({
            rows: [
                {
                    id: "case-51",
                    work_id: "work-one",
                    version_id: "version-one",
                    submitter_user_id: "user-one",
                    case_type: "appeal",
                    category: "appeal",
                    description: "申诉说明",
                    status: "open",
                    created_at: "2026-08-10T00:00:00.000Z",
                    updated_at: "2026-08-10T00:00:00.000Z",
                    total_count: "51",
                },
            ],
        });
        const repository = new WorkGovernanceRepository({ query });

        const result = await repository.listCasesForOwner("work-one", "user-one", { page: 3, pageSize: 20 });
        const [sql, params] = query.mock.calls[0] as [string, unknown[]];

        expect(sql).toContain("cases.case_type = 'appeal'");
        expect(sql).toContain("cases.submitter_user_id = $2");
        expect(sql).toContain("LIMIT $3 OFFSET $4");
        expect(params).toEqual(["work-one", "user-one", 20, 40]);
        expect(result).toMatchObject({ total: 51, page: 3, pageSize: 20, items: [{ id: "case-51", caseType: "appeal" }] });
    });
});
