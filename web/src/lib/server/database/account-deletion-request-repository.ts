import { readJsonDataFile, writeJsonDataFile } from "@/lib/server/data-adapter";
import { ensurePostgresSchema, getDatabaseProvider, postgresQuery, type QueryExecutor } from "@/lib/server/database/postgres";
import type { AccountDeletionRequestStatus } from "@/lib/account-deletion-contract";

export type StoredAccountDeletionRequest = {
    id: string;
    userId: string;
    accountId?: string;
    username: string;
    displayName: string;
    email?: string;
    status: AccountDeletionRequestStatus;
    note: string;
    reviewNote: string;
    reviewedByUserId?: string;
    reviewedByUsername?: string;
    requestedAt: string;
    updatedAt: string;
    handledAt?: string;
};

type RequestDatabase = { version: 1; requests: StoredAccountDeletionRequest[] };

export type AccountDeletionRequestDatabase = RequestDatabase;

const FILE_NAME = "account-deletion-requests.json";
let mutationQueue = Promise.resolve();

export async function readLatestAccountDeletionRequestForUser(userId: string) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery("SELECT * FROM account_deletion_requests WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 1", [userId]);
        return result.rows[0] ? mapRow(result.rows[0]) : null;
    }
    const db = await readFileDatabase();
    return db.requests.filter((item) => item.userId === userId).sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt))[0] || null;
}

export async function createAccountDeletionRequest(request: StoredAccountDeletionRequest) {
    const value = normalizeRequest(request);
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery(
            `INSERT INTO account_deletion_requests (
                id, user_id, username_snapshot, display_name_snapshot, email_snapshot, status, request_note,
                review_note, reviewed_by_user_id, reviewed_by_username, requested_at, updated_at, handled_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT (user_id) WHERE status = 'pending' DO NOTHING
             RETURNING *`,
            [
                value.id,
                value.userId,
                value.username,
                value.displayName,
                value.email || null,
                value.status,
                value.note,
                value.reviewNote,
                value.reviewedByUserId || null,
                value.reviewedByUsername || null,
                value.requestedAt,
                value.updatedAt,
                value.handledAt || null,
            ],
        );
        return result.rows[0] ? mapRow(result.rows[0]) : null;
    }
    return mutateFileDatabase((db) => {
        if (db.requests.some((item) => item.userId === value.userId && item.status === "pending")) return null;
        db.requests.push(value);
        return value;
    });
}

export async function withdrawPendingAccountDeletionRequest(userId: string, updatedAt: string) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery(
            `UPDATE account_deletion_requests
             SET status = 'withdrawn', updated_at = $2, handled_at = $2
             WHERE id = (
                 SELECT id FROM account_deletion_requests
                 WHERE user_id = $1 AND status = 'pending'
                 ORDER BY requested_at DESC LIMIT 1
             )
             RETURNING *`,
            [userId, updatedAt],
        );
        return result.rows[0] ? mapRow(result.rows[0]) : null;
    }
    return mutateFileDatabase((db) => {
        const request = db.requests.filter((item) => item.userId === userId && item.status === "pending").sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt))[0];
        if (!request) return null;
        request.status = "withdrawn";
        request.updatedAt = updatedAt;
        request.handledAt = updatedAt;
        return request;
    });
}

export async function reviewPendingAccountDeletionRequest(input: { id: string; status: "accepted" | "rejected"; reviewNote: string; reviewedByUserId: string; reviewedByUsername: string; updatedAt: string }, executor?: QueryExecutor) {
    if (getDatabaseProvider() === "postgres") {
        if (!executor) await ensurePostgresSchema();
        const query = executor ? executor.query.bind(executor) : postgresQuery;
        const result = await query(
            `UPDATE account_deletion_requests
             SET status = $2, review_note = $3, reviewed_by_user_id = $4, reviewed_by_username = $5,
                 updated_at = $6, handled_at = $6
             WHERE id = $1 AND status = 'pending'
             RETURNING *`,
            [input.id, input.status, input.reviewNote, input.reviewedByUserId, input.reviewedByUsername, input.updatedAt],
        );
        return result.rows[0] ? mapRow(result.rows[0]) : null;
    }
    return mutateFileDatabase((db) => {
        const request = db.requests.find((item) => item.id === input.id && item.status === "pending");
        if (!request) return null;
        request.status = input.status;
        request.reviewNote = input.reviewNote;
        request.reviewedByUserId = input.reviewedByUserId;
        request.reviewedByUsername = input.reviewedByUsername;
        request.updatedAt = input.updatedAt;
        request.handledAt = input.updatedAt;
        return request;
    });
}

export async function revertAcceptedAccountDeletionRequest(input: { id: string; reviewedByUserId: string; updatedAt: string }) {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery(
            `UPDATE account_deletion_requests
             SET status = 'pending', review_note = '', reviewed_by_user_id = NULL, reviewed_by_username = NULL,
                 updated_at = $3, handled_at = NULL
             WHERE id = $1 AND status = 'accepted' AND reviewed_by_user_id = $2
             RETURNING id`,
            [input.id, input.reviewedByUserId, input.updatedAt],
        );
        return Boolean(result.rows[0]);
    }
    return mutateFileDatabase((db) => {
        const request = db.requests.find((item) => item.id === input.id && item.status === "accepted" && item.reviewedByUserId === input.reviewedByUserId);
        if (!request) return false;
        request.status = "pending";
        request.reviewNote = "";
        request.reviewedByUserId = undefined;
        request.reviewedByUsername = undefined;
        request.updatedAt = input.updatedAt;
        request.handledAt = undefined;
        return true;
    });
}

export async function listAccountDeletionRequests(input: { page?: number; pageSize?: number; keyword?: string; status?: AccountDeletionRequestStatus } = {}) {
    const page = Math.max(1, Math.floor(Number(input.page) || 1));
    const pageSize = Math.max(1, Math.min(100, Math.floor(Number(input.pageSize) || 20)));
    const keyword = text(input.keyword, 120).toLowerCase();
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        const result = await postgresQuery(
            `SELECT requests.*, users.account_id, count(*) OVER() AS total_count
             FROM account_deletion_requests requests
             LEFT JOIN users ON users.id = requests.user_id
             WHERE ($1 = '' OR lower(requests.username_snapshot) LIKE $2 OR lower(requests.display_name_snapshot) LIKE $2
                    OR lower(coalesce(requests.email_snapshot, '')) LIKE $2 OR lpad(users.account_id::text, 4, '0') LIKE $2)
               AND ($3::text IS NULL OR requests.status = $3)
             ORDER BY requests.requested_at DESC
             LIMIT $4 OFFSET $5`,
            [keyword, `%${keyword}%`, input.status || null, pageSize, (page - 1) * pageSize],
        );
        return { items: result.rows.map(mapRow), total: Number(result.rows[0]?.total_count || 0), page, pageSize };
    }
    const db = await readFileDatabase();
    const filtered = db.requests
        .filter((item) => (input.status ? item.status === input.status : true))
        .filter((item) => (keyword ? [item.accountId, item.username, item.displayName, item.email].filter(Boolean).join(" ").toLowerCase().includes(keyword) : true))
        .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt));
    const start = (page - 1) * pageSize;
    return { items: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize };
}

export async function readAccountDeletionRequestBackup(executor?: QueryExecutor): Promise<AccountDeletionRequestDatabase> {
    if (getDatabaseProvider() === "postgres") {
        if (!executor) throw new Error("PostgreSQL account deletion snapshots require an explicit backup transaction");
        const query = executor.query.bind(executor);
        const result = await query("SELECT * FROM account_deletion_requests ORDER BY requested_at ASC");
        return { version: 1, requests: result.rows.map(mapRow) };
    }
    return readFileDatabase();
}

export async function writeAccountDeletionRequestBackup(data: AccountDeletionRequestDatabase, executor?: QueryExecutor) {
    const normalized = { version: 1 as const, requests: Array.isArray(data.requests) ? data.requests.map(normalizeRequest) : [] };
    if (getDatabaseProvider() === "postgres") {
        if (!executor) throw new Error("Full PostgreSQL account deletion writes require an explicit backup transaction");
        const query = executor.query.bind(executor);
        await query("DELETE FROM account_deletion_requests");
        await upsertPostgresAccountDeletionRequests(query, normalized.requests);
        return;
    }
    await writeJsonDataFile(FILE_NAME, normalized);
}

export async function upsertAccountDeletionRequestBackup(data: AccountDeletionRequestDatabase, executor: QueryExecutor) {
    const requests = Array.isArray(data.requests) ? data.requests.map(normalizeRequest) : [];
    await upsertPostgresAccountDeletionRequests(executor.query.bind(executor), requests);
}

async function upsertPostgresAccountDeletionRequests(query: QueryExecutor["query"], requests: StoredAccountDeletionRequest[]) {
    for (const request of requests) {
        await query(
            `INSERT INTO account_deletion_requests (
                id, user_id, username_snapshot, display_name_snapshot, email_snapshot, status, request_note,
                review_note, reviewed_by_user_id, reviewed_by_username, requested_at, updated_at, handled_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT (id) DO UPDATE SET
                user_id = EXCLUDED.user_id,
                username_snapshot = EXCLUDED.username_snapshot,
                display_name_snapshot = EXCLUDED.display_name_snapshot,
                email_snapshot = EXCLUDED.email_snapshot,
                status = EXCLUDED.status,
                request_note = EXCLUDED.request_note,
                review_note = EXCLUDED.review_note,
                reviewed_by_user_id = EXCLUDED.reviewed_by_user_id,
                reviewed_by_username = EXCLUDED.reviewed_by_username,
                requested_at = EXCLUDED.requested_at,
                updated_at = EXCLUDED.updated_at,
                handled_at = EXCLUDED.handled_at`,
            [
                request.id,
                request.userId,
                request.username,
                request.displayName,
                request.email || null,
                request.status,
                request.note,
                request.reviewNote,
                request.reviewedByUserId || null,
                request.reviewedByUsername || null,
                request.requestedAt,
                request.updatedAt,
                request.handledAt || null,
            ],
        );
    }
}

async function readFileDatabase(): Promise<RequestDatabase> {
    const value = await readJsonDataFile<Partial<RequestDatabase>>(FILE_NAME, { version: 1, requests: [] });
    return { version: 1, requests: Array.isArray(value.requests) ? value.requests.map(normalizeRequest) : [] };
}

async function mutateFileDatabase<T>(mutator: (db: RequestDatabase) => T | Promise<T>) {
    const operation = mutationQueue.then(async () => {
        const db = await readFileDatabase();
        const result = await mutator(db);
        await writeJsonDataFile(FILE_NAME, db);
        return result;
    });
    mutationQueue = operation.then(
        () => undefined,
        () => undefined,
    );
    return operation;
}

function mapRow(row: Record<string, unknown>) {
    return normalizeRequest(row);
}

function normalizeRequest(value: unknown): StoredAccountDeletionRequest {
    const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const now = new Date().toISOString();
    const status = source.status;
    return {
        id: text(source.id, 120),
        userId: text(source.userId ?? source.user_id, 120),
        accountId: optionalText(source.accountId ?? source.account_id, 24),
        username: text(source.username ?? source.username_snapshot, 80),
        displayName: text(source.displayName ?? source.display_name_snapshot, 80),
        email: optionalText(source.email ?? source.email_snapshot, 320),
        status: status === "accepted" || status === "rejected" || status === "withdrawn" ? status : "pending",
        note: text(source.note ?? source.request_note, 500),
        reviewNote: text(source.reviewNote ?? source.review_note, 1000),
        reviewedByUserId: optionalText(source.reviewedByUserId ?? source.reviewed_by_user_id, 120),
        reviewedByUsername: optionalText(source.reviewedByUsername ?? source.reviewed_by_username, 80),
        requestedAt: iso(source.requestedAt ?? source.requested_at) || now,
        updatedAt: iso(source.updatedAt ?? source.updated_at) || now,
        handledAt: optionalIso(source.handledAt ?? source.handled_at),
    };
}

function text(value: unknown, maxLength: number) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : value === null || value === undefined ? "" : String(value).trim().slice(0, maxLength);
}

function optionalText(value: unknown, maxLength: number) {
    return text(value, maxLength) || undefined;
}

function iso(value: unknown) {
    const date = value instanceof Date ? value : new Date(String(value || ""));
    return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function optionalIso(value: unknown) {
    return value ? iso(value) || undefined : undefined;
}
