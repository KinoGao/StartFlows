import type { CanvasProject, CanvasProjectMutation, CanvasProjectSaveAck, CanvasProjectSummary, CanvasProjectSummaryPage } from "@/lib/canvas-project-contract";
import { applyCanvasProjectMutation } from "@/lib/canvas-project-mutation";
import { summarizeCanvasProjectRecord } from "@/lib/canvas-project-summary";
import { summarizeCanvasProject, type CreateOverviewMedia, type CreateOverviewProject } from "@/lib/create-workbench-overview";
import { readJsonDataFile, withJsonDataFileLock, writeJsonDataFile } from "@/lib/server/data-adapter";
import { ensurePostgresSchema, getDatabaseProvider, postgresQuery } from "@/lib/server/database";

type CanvasProjectRecord = { userId: string; project: CanvasProject };
type CanvasProjectDatabase = { version: 1; projects: CanvasProjectRecord[] };
type StoredCanvasProject = CanvasProject & { __canvasLastMutationId?: string };
export type CanvasProjectPage = { items: CanvasProject[]; total: number; page: number; pageSize: number };

const FILE_NAME = "canvas-projects.json";
let mutationQueue = Promise.resolve();

export async function listCanvasProjects(userId: string) {
    if (getDatabaseProvider() === "postgres") throw new Error("PostgreSQL Canvas reads must use a paginated project query");
    return (await readDatabase()).projects
        .filter((record) => record.userId === userId)
        .map((record) => toPublicProject(record.project as StoredCanvasProject))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

export async function listCanvasProjectPage(userId: string, input: { page: number; pageSize: number }): Promise<CanvasProjectPage> {
    const offset = (input.page - 1) * input.pageSize;
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<{ project_json?: StoredCanvasProject; total_count: unknown }>(
            `WITH filtered AS (
                 SELECT id, updated_at, project_json
                 FROM canvas_projects
                 WHERE user_id = $1
             ), page_items AS (
                 SELECT id, updated_at, project_json
                 FROM filtered
                 ORDER BY updated_at DESC, id ASC
                 LIMIT $2 OFFSET $3
             )
             SELECT page_items.project_json, totals.total_count
             FROM (SELECT count(*)::integer AS total_count FROM filtered) totals
             LEFT JOIN page_items ON TRUE
             ORDER BY page_items.updated_at DESC NULLS LAST, page_items.id ASC`,
            [userId, input.pageSize, offset],
        );
        return {
            ...input,
            items: result.rows.flatMap((row) => (row.project_json ? [toPublicProject(row.project_json)] : [])),
            total: Math.max(0, Number(result.rows[0]?.total_count) || 0),
        };
    }
    const projects = await listCanvasProjects(userId);
    return { ...input, items: projects.slice(offset, offset + input.pageSize), total: projects.length };
}

export async function listCanvasProjectSummaries(userId: string, input: { page: number; pageSize: number }): Promise<CanvasProjectSummaryPage> {
    const offset = (input.page - 1) * input.pageSize;
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<Record<string, unknown>>(
            `WITH filtered AS (
                 SELECT id, title, created_at, updated_at,
                        project_json->>'sourceHandoffId' AS source_handoff_id,
                        project_json->>'creativeConversationId' AS creative_conversation_id,
                        jsonb_array_length(CASE WHEN jsonb_typeof(project_json->'nodes') = 'array' THEN project_json->'nodes' ELSE '[]'::jsonb END) AS node_count,
                        jsonb_array_length(CASE WHEN jsonb_typeof(project_json->'connections') = 'array' THEN project_json->'connections' ELSE '[]'::jsonb END) AS connection_count
                 FROM canvas_projects
                 WHERE user_id = $1
             ), page_items AS (
                 SELECT * FROM filtered ORDER BY updated_at DESC, id ASC LIMIT $2 OFFSET $3
             )
             SELECT page_items.*, totals.total_count
             FROM (SELECT count(*)::integer AS total_count FROM filtered) totals
             LEFT JOIN page_items ON TRUE
             ORDER BY page_items.updated_at DESC NULLS LAST, page_items.id ASC`,
            [userId, input.pageSize, offset],
        );
        return { projects: result.rows.filter((row) => row.id).map(mapProjectSummary), total: Math.max(0, Number(result.rows[0]?.total_count) || 0), ...input };
    }
    const projects = (await listCanvasProjects(userId)).map(summarizeCanvasProjectRecord);
    return { projects: projects.slice(offset, offset + input.pageSize), total: projects.length, ...input };
}

export async function getLatestCanvasProjectOverview(userId: string): Promise<CreateOverviewProject | undefined> {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<Record<string, unknown>>(
            `
            SELECT
                id,
                title,
                updated_at,
                jsonb_array_length(CASE WHEN jsonb_typeof(project_json->'nodes') = 'array' THEN project_json->'nodes' ELSE '[]'::jsonb END) AS node_count,
                jsonb_array_length(CASE WHEN jsonb_typeof(project_json->'connections') = 'array' THEN project_json->'connections' ELSE '[]'::jsonb END) AS connection_count,
                COALESCE((
                    SELECT jsonb_agg(jsonb_build_object('kind', preview.kind, 'url', preview.url) ORDER BY preview.status_order, preview.kind_order, preview.node_order, preview.url_order)
                    FROM (
                        SELECT
                            CASE WHEN node->>'type' = 'video' THEN 'video' ELSE 'image' END AS kind,
                            media.url,
                            CASE WHEN node->'metadata'->>'status' = 'success' THEN 0 ELSE 1 END AS status_order,
                            CASE WHEN node->>'type' IN ('image', 'panorama') THEN 0 ELSE 1 END AS kind_order,
                            node_order,
                            media.url_order
                        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(project_json->'nodes') = 'array' THEN project_json->'nodes' ELSE '[]'::jsonb END) WITH ORDINALITY AS project_node(node, node_order)
                        CROSS JOIN LATERAL (
                            VALUES
                                (node->'metadata'->>'serverUrl', 1),
                                (node->'metadata'->>'remoteUrl', 2),
                                (node->'metadata'->>'content', 3)
                        ) AS media(url, url_order)
                        WHERE node->>'type' IN ('image', 'panorama', 'video')
                          AND COALESCE(node->'metadata'->>'status', '') <> 'error'
                          AND COALESCE(btrim(media.url), '') <> ''
                          AND media.url !~* '^(data|blob):'
                        ORDER BY status_order, kind_order, node_order, media.url_order
                        LIMIT 18
                    ) preview
                ), '[]'::jsonb) AS previews
            FROM canvas_projects
            WHERE user_id = $1
            ORDER BY updated_at DESC
            LIMIT 1
            `,
            [userId],
        );
        return result.rows[0] ? mapPostgresOverview(result.rows[0]) : undefined;
    }
    const project = (await listCanvasProjects(userId))[0];
    return project ? summarizeCanvasProject(project) : undefined;
}

export async function getCanvasProject(id: string, userId: string) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<{ project_json: CanvasProject }>("SELECT project_json FROM canvas_projects WHERE id = $1 AND user_id = $2", [id, userId]);
        return result.rows[0] ? toPublicProject(result.rows[0].project_json as StoredCanvasProject) : null;
    }
    const record = (await readDatabase()).projects.find((item) => item.userId === userId && item.project.id === id);
    return record ? toPublicProject(record.project as StoredCanvasProject) : null;
}

export async function createCanvasProject(userId: string, project: CanvasProject) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        await postgresQuery(
            `INSERT INTO canvas_projects (id, user_id, title, project_json, created_at, updated_at)
             VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
            [project.id, userId, project.title, JSON.stringify(project), new Date(project.createdAt), new Date(project.updatedAt)],
        );
        return project;
    }
    await mutateDatabase((db) => {
        if (db.projects.some((record) => record.project.id === project.id)) throw new CanvasProjectStoreError("画布项目已存在", 409);
        return { ...db, projects: [{ userId, project }, ...db.projects] };
    });
    return project;
}

export async function updateCanvasProject(userId: string, project: CanvasProject, expectedUpdatedAt: string) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery(
            `UPDATE canvas_projects SET title = $3, project_json = $4::jsonb, updated_at = $5
             WHERE id = $1 AND user_id = $2 AND project_json->>'updatedAt' = $6
             RETURNING id`,
            [project.id, userId, project.title, JSON.stringify(project), new Date(project.updatedAt), expectedUpdatedAt],
        );
        if (!result.rows[0]) {
            const existing = await getCanvasProject(project.id, userId);
            throw new CanvasProjectStoreError(existing ? "画布项目已在其他页面更新，请刷新后重试" : "画布项目不存在", existing ? 409 : 404);
        }
        return project;
    }
    let found = false;
    await mutateDatabase((db) => ({
        ...db,
        projects: db.projects.map((record) => {
            if (record.userId !== userId || record.project.id !== project.id) return record;
            found = true;
            if (record.project.updatedAt !== expectedUpdatedAt) throw new CanvasProjectStoreError("画布项目已在其他页面更新，请刷新后重试", 409);
            return { ...record, project };
        }),
    }));
    if (!found) throw new CanvasProjectStoreError("画布项目不存在", 404);
    return project;
}

export async function updateCanvasProjectMutation(userId: string, project: CanvasProject, expectedUpdatedAt: string, mutationId: string) {
    const storedProject = withMutationId(project, mutationId);
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<{ project_json: StoredCanvasProject }>(
            `UPDATE canvas_projects SET title = $3, project_json = $4::jsonb, updated_at = $5
             WHERE id = $1 AND user_id = $2
               AND project_json->>'updatedAt' = $6
             RETURNING project_json`,
            [project.id, userId, project.title, JSON.stringify(storedProject), new Date(project.updatedAt), expectedUpdatedAt],
        );
        if (result.rows[0]) return toPublicProject(result.rows[0].project_json);
        const existingResult = await postgresQuery<{ project_json: StoredCanvasProject }>("SELECT project_json FROM canvas_projects WHERE id = $1 AND user_id = $2", [project.id, userId]);
        const existing = existingResult.rows[0]?.project_json;
        if (existing?.__canvasLastMutationId === mutationId) return toPublicProject(existing);
        throw new CanvasProjectStoreError(existing ? "画布项目已在其他页面更新，请刷新后重试" : "画布项目不存在", existing ? 409 : 404);
    }
    let found = false;
    let saved: CanvasProject | null = null;
    await mutateDatabase((db) => ({
        ...db,
        projects: db.projects.map((record) => {
            if (record.userId !== userId || record.project.id !== project.id) return record;
            found = true;
            const current = record.project as StoredCanvasProject;
            if (current.__canvasLastMutationId === mutationId) {
                saved = toPublicProject(current);
                return record;
            }
            if (current.updatedAt !== expectedUpdatedAt) throw new CanvasProjectStoreError("画布项目已在其他页面更新，请刷新后重试", 409);
            saved = project;
            return { ...record, project: storedProject };
        }),
    }));
    if (!found) throw new CanvasProjectStoreError("画布项目不存在", 404);
    return saved || project;
}

/** Applies a compact client mutation without reading or rewriting the full PostgreSQL snapshot in Node. */
export async function updateCanvasProjectMutationPatch(userId: string, projectId: string, mutation: CanvasProjectMutation): Promise<CanvasProjectSaveAck> {
    if (getDatabaseProvider() === "postgres") return updatePostgresProjectMutation(userId, projectId, mutation);

    let found = false;
    let ack: CanvasProjectSaveAck | null = null;
    await mutateDatabase((db) => ({
        ...db,
        projects: db.projects.map((record) => {
            if (record.userId !== userId || record.project.id !== projectId) return record;
            found = true;
            const current = record.project as StoredCanvasProject;
            if (current.__canvasLastMutationId === mutation.mutationId) {
                ack = { projectId, updatedAt: current.updatedAt, mutationId: mutation.mutationId };
                return record;
            }
            if (current.updatedAt !== mutation.baseUpdatedAt) throw new CanvasProjectStoreError("画布项目已在其他页面更新，请刷新后重试", 409);
            const updatedAt = nextProjectVersion(current.updatedAt);
            const next = applyCanvasProjectMutation(current, mutation, updatedAt);
            ack = { projectId, updatedAt, mutationId: mutation.mutationId };
            return { ...record, project: withMutationId(next, mutation.mutationId) };
        }),
    }));
    if (!found) throw new CanvasProjectStoreError("画布项目不存在", 404);
    return ack || { projectId, updatedAt: mutation.baseUpdatedAt, mutationId: mutation.mutationId };
}

async function updatePostgresProjectMutation(userId: string, projectId: string, mutation: CanvasProjectMutation): Promise<CanvasProjectSaveAck> {
    await ensurePostgresSchema();
    const values: unknown[] = [projectId, userId, mutation.mutationId, mutation.baseUpdatedAt];
    let projectExpression = "p.project_json";
    let titleExpression = "p.title";

    projectExpression = applyEntityJsonMutation(projectExpression, "nodes", mutation.nodeUpserts, mutation.nodeDeletes, values);
    projectExpression = applyEntityJsonMutation(projectExpression, "connections", mutation.connectionUpserts, mutation.connectionDeletes, values);
    projectExpression = applyEntityJsonMutation(projectExpression, "chatSessions", mutation.chatSessionUpserts, mutation.chatSessionDeletes, values);
    if (mutation.title !== undefined) {
        const index = values.push(mutation.title);
        titleExpression = `$${index}::text`;
        projectExpression = `jsonb_set(${projectExpression}, '{title}', to_jsonb($${index}::text), true)`;
    }
    if (mutation.creativeConversationId !== undefined) {
        const index = values.push(mutation.creativeConversationId);
        projectExpression = `jsonb_set(${projectExpression}, '{creativeConversationId}', to_jsonb($${index}::text), true)`;
    }
    if (mutation.activeChatId !== undefined) {
        const index = values.push(mutation.activeChatId);
        projectExpression = `jsonb_set(${projectExpression}, '{activeChatId}', COALESCE(to_jsonb($${index}::text), 'null'::jsonb), true)`;
    }
    if (mutation.backgroundMode !== undefined) {
        const index = values.push(mutation.backgroundMode);
        projectExpression = `jsonb_set(${projectExpression}, '{backgroundMode}', to_jsonb($${index}::text), true)`;
    }
    if (mutation.showImageInfo !== undefined) {
        const index = values.push(mutation.showImageInfo);
        projectExpression = `jsonb_set(${projectExpression}, '{showImageInfo}', to_jsonb($${index}::boolean), true)`;
    }
    if (mutation.viewport !== undefined) {
        const index = values.push(JSON.stringify(mutation.viewport));
        projectExpression = `jsonb_set(${projectExpression}, '{viewport}', $${index}::jsonb, true)`;
    }
    const mutationIndex = values.length + 1;
    values.push(mutation.mutationId);
    projectExpression = `jsonb_set(${projectExpression}, '{__canvasLastMutationId}', to_jsonb($${mutationIndex}::text), true)`;
    projectExpression = `jsonb_set(${projectExpression}, '{updatedAt}', to_jsonb(to_char(v.now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), true)`;

    const result = await postgresQuery<{ id: string; updated_at: Date | string }>(
        `WITH versioned AS (SELECT clock_timestamp() AS now)
         UPDATE canvas_projects AS p
         SET title = ${titleExpression}, project_json = ${projectExpression}, updated_at = v.now
         FROM versioned AS v
         WHERE p.id = $1 AND p.user_id = $2
           AND p.project_json->>'updatedAt' = $4
           AND p.project_json->>'__canvasLastMutationId' IS DISTINCT FROM $3
         RETURNING p.id, p.updated_at`,
        values,
    );
    if (result.rows[0]) return { projectId, updatedAt: toIsoDate(result.rows[0].updated_at), mutationId: mutation.mutationId };

    const existing = await postgresQuery<{ updated_at: Date | string; last_mutation_id: string | null }>("SELECT updated_at, project_json->>'__canvasLastMutationId' AS last_mutation_id FROM canvas_projects WHERE id = $1 AND user_id = $2", [
        projectId,
        userId,
    ]);
    const row = existing.rows[0];
    if (!row) throw new CanvasProjectStoreError("画布项目不存在", 404);
    if (row.last_mutation_id === mutation.mutationId) return { projectId, updatedAt: toIsoDate(row.updated_at), mutationId: mutation.mutationId };
    throw new CanvasProjectStoreError("画布项目已在其他页面更新，请刷新后重试", 409);
}

function applyEntityJsonMutation(source: string, field: "nodes" | "connections" | "chatSessions", upserts: unknown[] | undefined, deletes: string[] | undefined, values: unknown[]) {
    if (!upserts?.length && !deletes?.length) return source;
    const upsertIndex = values.push(JSON.stringify(upserts || []));
    const deleteIndex = values.push(deletes || []);
    const array = `CASE WHEN jsonb_typeof(${source}->'${field}') = 'array' THEN ${source}->'${field}' ELSE '[]'::jsonb END`;
    const merged = `(SELECT COALESCE(jsonb_agg(item ORDER BY ord), '[]'::jsonb)
        FROM (
            SELECT COALESCE((
                SELECT incoming.item
                FROM jsonb_array_elements($${upsertIndex}::jsonb) AS incoming(item)
                WHERE incoming.item->>'id' = existing.item->>'id'
                LIMIT 1
            ), existing.item) AS item, existing.ord::numeric AS ord
            FROM jsonb_array_elements(${array}) WITH ORDINALITY AS existing(item, ord)
            WHERE existing.item->>'id' <> ALL($${deleteIndex}::text[])
            UNION ALL
            SELECT incoming.item, 1000000000::numeric + incoming.ord
            FROM jsonb_array_elements($${upsertIndex}::jsonb) WITH ORDINALITY AS incoming(item, ord)
            WHERE incoming.item->>'id' <> ALL($${deleteIndex}::text[])
              AND NOT EXISTS (
                  SELECT 1 FROM jsonb_array_elements(${array}) AS existing(item)
                  WHERE existing.item->>'id' = incoming.item->>'id'
              )
        ) merged)`;
    return `jsonb_set(${source}, '{${field}}', ${merged}, true)`;
}

function readDatabase() {
    return readJsonDataFile<CanvasProjectDatabase>(FILE_NAME, { version: 1, projects: [] });
}

function withMutationId(project: CanvasProject, mutationId: string): StoredCanvasProject {
    return { ...project, __canvasLastMutationId: mutationId };
}

function toPublicProject(project: StoredCanvasProject): CanvasProject {
    const { __canvasLastMutationId: _mutationId, ...publicProject } = project;
    return publicProject;
}

function mutateDatabase(mutator: (database: CanvasProjectDatabase) => CanvasProjectDatabase) {
    const operation = mutationQueue.then(() => withJsonDataFileLock(FILE_NAME, async () => writeJsonDataFile(FILE_NAME, mutator(await readDatabase()))));
    mutationQueue = operation.catch(() => undefined);
    return operation;
}

function mapPostgresOverview(row: Record<string, unknown>): CreateOverviewProject {
    const previews = jsonArray(row.previews);
    const seen = new Set<string>();
    return {
        id: String(row.id || ""),
        title: String(row.title || ""),
        updatedAt: isoDate(row.updated_at),
        nodeCount: Math.max(0, Number(row.node_count) || 0),
        connectionCount: Math.max(0, Number(row.connection_count) || 0),
        previews: previews
            .flatMap((item): CreateOverviewMedia[] => {
                const source = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
                const kind = source.kind === "video" ? "video" : source.kind === "image" ? "image" : undefined;
                const url = typeof source.url === "string" ? source.url.trim() : "";
                if (!kind || !url || /^(data|blob):/i.test(url) || seen.has(url)) return [];
                seen.add(url);
                return [{ kind, url }];
            })
            .slice(0, 6),
    };
}

function mapProjectSummary(row: Record<string, unknown>): CanvasProjectSummary {
    const sourceHandoffId = String(row.source_handoff_id || "").trim();
    const creativeConversationId = String(row.creative_conversation_id || "").trim();
    return {
        id: String(row.id || ""),
        ...(sourceHandoffId ? { sourceHandoffId } : {}),
        ...(creativeConversationId ? { creativeConversationId } : {}),
        title: String(row.title || ""),
        nodeCount: Math.max(0, Number(row.node_count) || 0),
        connectionCount: Math.max(0, Number(row.connection_count) || 0),
        createdAt: isoDate(row.created_at),
        updatedAt: isoDate(row.updated_at),
    };
}

function jsonArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string") return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function isoDate(value: unknown) {
    const date = value instanceof Date ? value : new Date(String(value || ""));
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

function toIsoDate(value: unknown) {
    const date = value instanceof Date ? value : new Date(String(value || ""));
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function nextProjectVersion(current: string) {
    const previous = Date.parse(current);
    return new Date(Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0)).toISOString();
}

export class CanvasProjectStoreError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}
