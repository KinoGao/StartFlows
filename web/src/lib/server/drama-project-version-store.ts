import { nanoid } from "nanoid";

import type { DramaProject, DramaProjectVersion } from "@/lib/drama-project-contract";
import { readJsonDataFile, writeJsonDataFile } from "@/lib/server/data-adapter";
import { ensurePostgresSchema, getDatabaseProvider, postgresQuery, withPostgresTransaction } from "@/lib/server/database";

type VersionRecord = DramaProjectVersion & { userId: string; snapshot: DramaProject };
type VersionDatabase = { version: 1; items: VersionRecord[] };

const FILE_NAME = "drama-project-versions.json";

export async function listDramaProjectVersions(userId: string, projectId: string): Promise<DramaProjectVersion[]> {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<DramaProjectVersion>('SELECT id, project_id AS "projectId", version, reason, created_at AS "createdAt" FROM drama_project_versions WHERE user_id = $1 AND project_id = $2 ORDER BY version DESC', [
            userId,
            projectId,
        ]);
        return result.rows;
    }
    return (await readDatabase()).items
        .filter((item) => item.userId === userId && item.projectId === projectId)
        .sort((a, b) => b.version - a.version)
        .map(({ userId: _userId, snapshot: _snapshot, ...item }) => item);
}

export async function createDramaProjectVersion(userId: string, projectId: string, reason: string, snapshot: DramaProject) {
    const id = `drama-version-${nanoid()}`;
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        return withPostgresTransaction(async (client) => {
            await client.query("SELECT id FROM drama_projects WHERE id = $1 AND user_id = $2 FOR UPDATE", [projectId, userId]);
            const result = await client.query<{ version: number }>("SELECT COALESCE(MAX(version), 0) + 1 AS version FROM drama_project_versions WHERE user_id = $1 AND project_id = $2", [userId, projectId]);
            const version = Number(result.rows[0]?.version || 1);
            const createdAt = new Date().toISOString();
            await client.query("INSERT INTO drama_project_versions (id, project_id, user_id, version, reason, snapshot, created_at) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)", [
                id,
                projectId,
                userId,
                version,
                reason,
                JSON.stringify(snapshot),
                new Date(createdAt),
            ]);
            return { id, projectId, version, reason, createdAt } satisfies DramaProjectVersion;
        });
    }
    return mutateDatabase((database) => {
        const version = Math.max(0, ...database.items.filter((item) => item.userId === userId && item.projectId === projectId).map((item) => item.version)) + 1;
        const item: VersionRecord = { id, projectId, userId, version, reason, snapshot, createdAt: new Date().toISOString() };
        return { database: { ...database, items: [item, ...database.items] }, result: item };
    });
}

export async function getDramaProjectVersion(userId: string, projectId: string, versionId: string) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery<{ id: string; project_id: string; version: number; reason: string; created_at: string; snapshot: DramaProject }>(
            "SELECT id, project_id, version, reason, created_at, snapshot FROM drama_project_versions WHERE id = $1 AND user_id = $2 AND project_id = $3",
            [versionId, userId, projectId],
        );
        const row = result.rows[0];
        return row ? { id: row.id, projectId: row.project_id, version: row.version, reason: row.reason, createdAt: row.created_at, snapshot: row.snapshot } : null;
    }
    return (await readDatabase()).items.find((item) => item.id === versionId && item.userId === userId && item.projectId === projectId) || null;
}

async function readDatabase() {
    return readJsonDataFile<VersionDatabase>(FILE_NAME, { version: 1, items: [] });
}

function writeDatabase(database: VersionDatabase) {
    return writeJsonDataFile(FILE_NAME, database);
}

let mutationQueue = Promise.resolve();
function mutateDatabase<T>(mutator: (database: VersionDatabase) => { database: VersionDatabase; result: T }) {
    const operation = mutationQueue.then(async () => {
        const mutation = mutator(await readDatabase());
        await writeDatabase(mutation.database);
        return mutation.result;
    });
    mutationQueue = operation.then(
        () => undefined,
        () => undefined,
    );
    return operation;
}
