import type { DramaProject, DramaProjectSummary, DramaProjectSummaryPage } from "@/lib/drama-project-contract";
import { normalizeDramaImageSize } from "@/lib/drama-image-size";
import { summarizeDramaProject } from "@/lib/drama-project-summary";
import { readJsonDataFile, writeJsonDataFile } from "@/lib/server/data-adapter";
import { ensurePostgresSchema, getDatabaseProvider, postgresQuery } from "@/lib/server/database";

type DramaProjectRecord = { userId: string; project: DramaProject };
type DramaProjectDatabase = { version: 1; projects: DramaProjectRecord[] };

const FILE_NAME = "drama-projects.json";

export async function listDramaProjectSummaries(userId: string, input: { page?: number; pageSize?: number } = {}): Promise<DramaProjectSummaryPage> {
    const page = Math.max(1, Math.floor(Number(input.page) || 1));
    const pageSize = Math.max(1, Math.min(100, Math.floor(Number(input.pageSize) || 20)));
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<DramaProjectSummaryRow>(
            `SELECT
                project.id,
                project.title,
                project.status,
                project.project_json->>'summary' AS summary,
                project.project_json->>'style' AS style,
                project.project_json->>'ratio' AS ratio,
                jsonb_array_length(COALESCE(project.project_json->'episodes', '[]'::jsonb)) AS episode_count,
                jsonb_array_length(COALESCE(project.project_json->'characters', '[]'::jsonb)) AS character_count,
                jsonb_array_length(COALESCE(project.project_json->'scenes', '[]'::jsonb)) AS scene_count,
                COALESCE(tasks.shot_count, 0) AS shot_count,
                COALESCE(tasks.pending_task_count, 0) AS pending_task_count,
                COALESCE(tasks.failed_task_count, 0) AS failed_task_count,
                COUNT(*) OVER() AS total_count,
                project.created_at,
                project.updated_at
             FROM drama_projects project
             LEFT JOIN LATERAL (
                SELECT
                    COUNT(*)::integer AS shot_count,
                    COUNT(*) FILTER (
                        WHERE shot->>'storyboardStatus' IN ('queued', 'running')
                           OR shot->>'storyboardEndStatus' IN ('queued', 'running')
                           OR shot->>'generationStatus' IN ('queued', 'running')
                           OR shot->>'audioStatus' IN ('queued', 'running')
                    )::integer AS pending_task_count,
                    COUNT(*) FILTER (
                        WHERE shot->>'storyboardStatus' = 'error'
                           OR shot->>'storyboardEndStatus' = 'error'
                           OR shot->>'generationStatus' = 'error'
                           OR shot->>'audioStatus' = 'error'
                    )::integer AS failed_task_count
                FROM jsonb_array_elements(COALESCE(project.project_json->'episodes', '[]'::jsonb)) episode
                CROSS JOIN LATERAL jsonb_array_elements(COALESCE(episode->'shots', '[]'::jsonb)) shot
             ) tasks ON TRUE
             WHERE project.user_id = $1
             ORDER BY project.updated_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, pageSize, (page - 1) * pageSize],
        );
        return { items: result.rows.map(summaryFromRow), total: Number(result.rows[0]?.total_count) || 0, page, pageSize };
    }
    const summaries = (await readDatabase()).projects
        .filter((record) => record.userId === userId)
        .map((record) => summarizeDramaProject(record.project))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { items: summaries.slice((page - 1) * pageSize, page * pageSize), total: summaries.length, page, pageSize };
}

export async function findDramaProjectBySourceHandoffId(userId: string, sourceHandoffId: string) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<{ project_json: DramaProject }>("SELECT project_json FROM drama_projects WHERE user_id = $1 AND project_json->>'sourceHandoffId' = $2 LIMIT 1", [userId, sourceHandoffId]);
        return result.rows[0]?.project_json || null;
    }
    return (await readDatabase()).projects.find((record) => record.userId === userId && record.project.sourceHandoffId === sourceHandoffId)?.project || null;
}

export async function getDramaProject(id: string, userId: string) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<{ project_json: DramaProject }>("SELECT project_json FROM drama_projects WHERE id = $1 AND user_id = $2", [id, userId]);
        return result.rows[0]?.project_json || null;
    }
    return (await readDatabase()).projects.find((record) => record.userId === userId && record.project.id === id)?.project || null;
}

export async function createDramaProject(userId: string, project: DramaProject) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        await postgresQuery(
            `INSERT INTO drama_projects (id, user_id, title, status, project_json, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
            [project.id, userId, project.title, project.status, JSON.stringify(project), new Date(project.createdAt), new Date(project.updatedAt)],
        );
        return project;
    }
    await mutateDatabase((db) => {
        if (db.projects.some((record) => record.project.id === project.id)) throw new DramaProjectStoreError("短剧项目已存在", 409);
        return { ...db, projects: [{ userId, project }, ...db.projects] };
    });
    return project;
}

export async function updateDramaProject(userId: string, project: DramaProject, expectedUpdatedAt?: string) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery(
            `UPDATE drama_projects SET title = $3, status = $4, project_json = $5::jsonb, updated_at = $6
             WHERE id = $1 AND user_id = $2
               AND ($7::text IS NULL OR project_json->>'updatedAt' = $7)
             RETURNING id`,
            [project.id, userId, project.title, project.status, JSON.stringify(project), new Date(project.updatedAt), expectedUpdatedAt || null],
        );
        if (!result.rows[0]) {
            const existing = await getDramaProject(project.id, userId);
            throw new DramaProjectStoreError(existing ? "短剧项目已在其他页面更新，请刷新后重试" : "短剧项目不存在", existing ? 409 : 404);
        }
        return project;
    }
    let found = false;
    await mutateDatabase((db) => ({
        ...db,
        projects: db.projects.map((record) => {
            if (record.userId !== userId || record.project.id !== project.id) return record;
            found = true;
            if (expectedUpdatedAt && record.project.updatedAt !== expectedUpdatedAt) throw new DramaProjectStoreError("短剧项目已在其他页面更新，请刷新后重试", 409);
            return { ...record, project };
        }),
    }));
    if (!found) throw new DramaProjectStoreError("短剧项目不存在", 404);
    return project;
}

export async function deleteDramaProject(userId: string, id: string) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery("DELETE FROM drama_projects WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
        return Boolean(result.rows[0]);
    }
    let deleted = false;
    await mutateDatabase((db) => ({
        ...db,
        projects: db.projects.filter((record) => {
            if (record.userId === userId && record.project.id === id) {
                deleted = true;
                return false;
            }
            return true;
        }),
    }));
    return deleted;
}

function readDatabase() {
    return readJsonDataFile<DramaProjectDatabase>(FILE_NAME, { version: 1, projects: [] });
}

function writeDatabase(database: DramaProjectDatabase) {
    return writeJsonDataFile(FILE_NAME, database);
}

let mutationQueue = Promise.resolve();
function mutateDatabase(mutator: (database: DramaProjectDatabase) => DramaProjectDatabase) {
    const operation = mutationQueue.then(async () => writeDatabase(mutator(await readDatabase())));
    mutationQueue = operation.catch(() => undefined);
    return operation;
}

export class DramaProjectStoreError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

type DramaProjectSummaryRow = {
    id: string;
    title: string;
    status: DramaProject["status"];
    summary: string | null;
    style: string | null;
    ratio: string | null;
    episode_count: number;
    character_count: number;
    scene_count: number;
    shot_count: number;
    pending_task_count: number;
    failed_task_count: number;
    total_count: number;
    created_at: Date | string;
    updated_at: Date | string;
};

function summaryFromRow(row: DramaProjectSummaryRow): DramaProjectSummary {
    return {
        id: row.id,
        title: row.title,
        summary: row.summary || "",
        style: row.style || "",
        ratio: normalizeDramaImageSize(row.ratio) || "9:16",
        status: row.status,
        episodeCount: Number(row.episode_count) || 0,
        characterCount: Number(row.character_count) || 0,
        sceneCount: Number(row.scene_count) || 0,
        shotCount: Number(row.shot_count) || 0,
        pendingTaskCount: Number(row.pending_task_count) || 0,
        failedTaskCount: Number(row.failed_task_count) || 0,
        createdAt: timestamp(row.created_at),
        updatedAt: timestamp(row.updated_at),
    };
}

function timestamp(value: Date | string) {
    return value instanceof Date ? value.toISOString() : value;
}
