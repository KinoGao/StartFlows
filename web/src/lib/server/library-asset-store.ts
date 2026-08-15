import type { Asset } from "@/lib/library-asset-contract";
import { readJsonDataFile, writeJsonDataFile } from "@/lib/server/data-adapter";
import { ensurePostgresSchema, getDatabaseProvider, postgresQuery } from "@/lib/server/database";

type AssetRecord = { userId: string; asset: Asset };
type AssetDatabase = { version: 1; assets: AssetRecord[] };
export type LibraryAssetPageInput = { page: number; pageSize: number; kind?: Asset["kind"]; keyword?: string };
export type LibraryAssetPage = LibraryAssetPageInput & { items: Asset[]; total: number };

const FILE_NAME = "library-assets.json";
let mutationQueue = Promise.resolve();

export async function listLibraryAssets(userId: string) {
    if (getDatabaseProvider() === "postgres") throw new Error("PostgreSQL library reads must use a paginated asset query");
    return (await readDatabase()).assets
        .filter((record) => record.userId === userId)
        .map((record) => record.asset)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

export async function listLibraryAssetPage(userId: string, input: LibraryAssetPageInput): Promise<LibraryAssetPage> {
    const keyword = input.keyword?.trim().toLowerCase() || "";
    const offset = (input.page - 1) * input.pageSize;
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<{ assets: Asset[]; total: unknown }>(
            `WITH filtered AS (
                 SELECT id, updated_at, asset_json
                 FROM library_assets
                 WHERE user_id = $1
                   AND ($2::text IS NULL OR kind = $2)
                   AND ($3::text = '' OR lower(concat_ws(' ', title, asset_json->>'source', asset_json->>'note', asset_json->'tags', asset_json->'data'->>'content', asset_json->'data'->>'mimeType')) LIKE $4)
             ), page_items AS (
                 SELECT id, updated_at, asset_json
                 FROM filtered
                 ORDER BY updated_at DESC, id ASC
                 LIMIT $5 OFFSET $6
             )
             SELECT (SELECT count(*) FROM filtered) AS total,
                    COALESCE((SELECT jsonb_agg(asset_json ORDER BY updated_at DESC, id ASC) FROM page_items), '[]'::jsonb) AS assets`,
            [userId, input.kind || null, keyword, `%${keyword}%`, input.pageSize, offset],
        );
        const row = result.rows[0];
        return { ...input, items: Array.isArray(row?.assets) ? row.assets : [], total: Math.max(0, Number(row?.total) || 0) };
    }
    const filtered = (await readDatabase()).assets
        .filter((record) => record.userId === userId)
        .map((record) => record.asset)
        .filter((asset) => (!input.kind || asset.kind === input.kind) && (!keyword || assetSearchText(asset).includes(keyword)))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    return { ...input, items: filtered.slice(offset, offset + input.pageSize), total: filtered.length };
}

export async function getLibraryAsset(userId: string, id: string) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<{ asset_json: Asset }>("SELECT asset_json FROM library_assets WHERE id = $1 AND user_id = $2", [id, userId]);
        return result.rows[0]?.asset_json || null;
    }
    return (await readDatabase()).assets.find((record) => record.userId === userId && record.asset.id === id)?.asset || null;
}

export async function createLibraryAsset(userId: string, asset: Asset) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        await postgresQuery(`INSERT INTO library_assets (id, user_id, kind, title, asset_json, created_at, updated_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`, [
            asset.id,
            userId,
            asset.kind,
            asset.title,
            JSON.stringify(asset),
            new Date(asset.createdAt),
            new Date(asset.updatedAt),
        ]);
        return asset;
    }
    await mutateDatabase((database) => ({ ...database, assets: [{ userId, asset }, ...database.assets] }));
    return asset;
}

export async function updateLibraryAsset(userId: string, asset: Asset) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery("UPDATE library_assets SET kind = $3, title = $4, asset_json = $5::jsonb, updated_at = $6 WHERE id = $1 AND user_id = $2 RETURNING id", [
            asset.id,
            userId,
            asset.kind,
            asset.title,
            JSON.stringify(asset),
            new Date(asset.updatedAt),
        ]);
        return result.rows[0] ? asset : null;
    }
    let found = false;
    await mutateDatabase((database) => ({
        ...database,
        assets: database.assets.map((record) => {
            if (record.userId !== userId || record.asset.id !== asset.id) return record;
            found = true;
            return { ...record, asset };
        }),
    }));
    return found ? asset : null;
}

export async function deleteLibraryAsset(userId: string, id: string) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        return Boolean((await postgresQuery("DELETE FROM library_assets WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId])).rows[0]);
    }
    let deleted = false;
    await mutateDatabase((database) => ({ ...database, assets: database.assets.filter((record) => (record.userId === userId && record.asset.id === id ? ((deleted = true), false) : true)) }));
    return deleted;
}

function readDatabase() {
    return readJsonDataFile<AssetDatabase>(FILE_NAME, { version: 1, assets: [] });
}

function mutateDatabase(mutator: (database: AssetDatabase) => AssetDatabase) {
    const operation = mutationQueue.then(async () => writeJsonDataFile(FILE_NAME, mutator(await readDatabase())));
    mutationQueue = operation.catch(() => undefined);
    return operation;
}

function assetSearchText(asset: Asset) {
    return [asset.title, asset.source || "", asset.note || "", asset.tags.join(" "), asset.kind === "text" ? asset.data.content : asset.data.mimeType].join(" ").toLowerCase();
}
