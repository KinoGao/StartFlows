import { randomUUID } from "node:crypto";

import type { PublicUser, UserRole } from "@/lib/auth/store";
import { ensurePostgresSchema, isPostgresDatabaseEnabled, postgresQuery, type QueryExecutor } from "@/lib/server/database";
import { readJsonDataFile, writeJsonDataFile } from "@/lib/server/data-adapter";
import { getClientIp } from "@/lib/server/security";
import type { LoginSecurityNotice, UserLoginEvent } from "@/lib/login-security";

type AuditLogStatus = "success" | "failure";

type AuditLogActor = {
    id?: string;
    username?: string;
    role?: UserRole;
    ip?: string;
    userAgent?: string;
};

type AuditLogTarget = {
    type: string;
    id?: string;
    label?: string;
};

type StoredAuditLog = {
    id: string;
    action: string;
    status: AuditLogStatus;
    actor: AuditLogActor;
    target?: AuditLogTarget;
    metadata?: Record<string, unknown>;
    createdAt: string;
};

type AuditLogListOptions = {
    page?: number;
    pageSize?: number;
    keyword?: string;
    action?: string;
    status?: string;
    actorId?: string;
    targetType?: string;
    start?: string;
    end?: string;
};

type AuditLogInput = {
    action: string;
    status?: AuditLogStatus;
    actor?: AuditLogActor;
    target?: AuditLogTarget;
    metadata?: Record<string, unknown>;
    createdAt?: string | number;
};

type AuditLogDatabase = {
    version: 1;
    logs: StoredAuditLog[];
};

const AUDIT_LOG_DATA_FILE = "audit-logs.json";
const MAX_AUDIT_LOGS = 50000;
const SECRET_KEY_PATTERN = /api.?key|authorization|cookie|password|secret|token|credential|private/i;

let mutationQueue = Promise.resolve();

export function auditActorFromRequest(request: Request, user?: Partial<Pick<PublicUser, "id" | "username" | "role">> | null): AuditLogActor {
    return {
        id: user?.id,
        username: user?.username,
        role: user?.role,
        ip: normalizeText(getClientIp(request), "", 120),
        userAgent: normalizeText(request.headers.get("user-agent") || "", "", 300),
    };
}

async function recordAuditLog(input: AuditLogInput) {
    if (isPostgresDatabaseEnabled()) {
        const log = normalizeStoredLog({
            id: randomUUID(),
            action: input.action,
            status: input.status,
            actor: input.actor,
            target: input.target,
            metadata: input.metadata,
            createdAt: normalizeTime(input.createdAt, new Date().toISOString()),
        });
        await insertPostgresAuditLog(log);
        return log;
    }
    return mutateAuditLogDb((db) => {
        const log: StoredAuditLog = {
            id: randomUUID(),
            action: normalizeAction(input.action),
            status: input.status === "failure" ? "failure" : "success",
            actor: normalizeActor(input.actor),
            target: normalizeTarget(input.target),
            metadata: normalizeMetadata(input.metadata),
            createdAt: normalizeTime(input.createdAt, new Date().toISOString()),
        };
        db.logs = [log, ...db.logs].slice(0, MAX_AUDIT_LOGS);
        return log;
    });
}

export async function safeRecordAuditLog(input: AuditLogInput) {
    try {
        return await recordAuditLog(input);
    } catch (error) {
        console.error("Audit log write failed", error);
        return null;
    }
}

export async function safeGetLoginSecurityNotice(userId: string, current: { ip?: string; userAgent?: string }): Promise<LoginSecurityNotice | undefined> {
    try {
        const previous = (await listUserLoginEvents(userId, { page: 1, pageSize: 1 })).items[0];
        return loginSecurityNoticeFrom(previous, current);
    } catch (error) {
        console.error("Login security context read failed", error);
        return undefined;
    }
}

export function loginSecurityNoticeFrom(previous: UserLoginEvent | undefined, current: { ip?: string; userAgent?: string }): LoginSecurityNotice | undefined {
    if (!previous) return undefined;
    const networkChanged = Boolean(previous.ip && current.ip && previous.ip !== current.ip);
    const deviceChanged = Boolean(previous.userAgent && current.userAgent && previous.userAgent !== current.userAgent);
    return networkChanged || deviceChanged ? { networkChanged, deviceChanged, previousLoginAt: previous.createdAt } : undefined;
}

export async function listUserLoginEvents(userId: string, options: { page?: number; pageSize?: number } = {}) {
    const result = await listAuditLogs({
        actorId: userId,
        action: "auth.login",
        status: "success",
        page: options.page,
        pageSize: options.pageSize,
    });
    return {
        items: result.items.map((log): UserLoginEvent => ({
            id: log.id,
            ip: log.actor.ip,
            userAgent: log.actor.userAgent,
            createdAt: log.createdAt,
        })),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
    };
}

export async function listAuditLogs(options: AuditLogListOptions = {}) {
    if (isPostgresDatabaseEnabled()) return listPostgresAuditLogs(options);
    const db = await readAuditLogDb();
    const page = Math.max(1, Math.floor(Number(options.page) || 1));
    const pageSize = Math.max(1, Math.min(100, Math.floor(Number(options.pageSize) || 20)));
    const keyword = normalizeText(options.keyword, "", 120).toLowerCase();
    const action = normalizeText(options.action, "", 120);
    const status = options.status === "success" || options.status === "failure" ? options.status : "";
    const actorId = normalizeText(options.actorId, "", 120);
    const targetType = normalizeText(options.targetType, "", 80);
    const startMs = parseDateStart(options.start);
    const endMs = parseDateEnd(options.end);

    const filtered = db.logs
        .filter((log) => (action ? log.action === action : true))
        .filter((log) => (status ? log.status === status : true))
        .filter((log) => (actorId ? log.actor.id === actorId : true))
        .filter((log) => (targetType ? log.target?.type === targetType : true))
        .filter((log) => {
            const time = Date.parse(log.createdAt);
            if (startMs && time < startMs) return false;
            if (endMs && time > endMs) return false;
            return true;
        })
        .filter((log) => {
            if (!keyword) return true;
            return [log.action, log.status, log.actor.username, log.actor.ip, log.target?.type, log.target?.id, log.target?.label].filter(Boolean).join(" ").toLowerCase().includes(keyword);
        })
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    const total = filtered.length;
    const startIndex = (page - 1) * pageSize;
    return { items: filtered.slice(startIndex, startIndex + pageSize), total, page, pageSize };
}

async function readAuditLogDb(): Promise<AuditLogDatabase> {
    if (isPostgresDatabaseEnabled()) throw new Error("PostgreSQL audit log reads must use the paginated repository query");
    return normalizeDb(await readJsonDataFile<Partial<AuditLogDatabase>>(AUDIT_LOG_DATA_FILE, emptyDb()));
}

async function mutateAuditLogDb<T>(mutator: (db: AuditLogDatabase) => T | Promise<T>) {
    const run = mutationQueue.then(async () => {
        const db = await readAuditLogDb();
        const result = await mutator(db);
        await writeAuditLogDb(db);
        return result;
    });
    mutationQueue = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
}

async function writeAuditLogDb(db: AuditLogDatabase) {
    if (isPostgresDatabaseEnabled()) throw new Error("PostgreSQL audit log writes must use entity inserts");
    await writeJsonDataFile(AUDIT_LOG_DATA_FILE, normalizeDb(db));
}

async function listPostgresAuditLogs(options: AuditLogListOptions = {}) {
    await ensurePostgresSchema();
    const page = Math.max(1, Math.floor(Number(options.page) || 1));
    const pageSize = Math.max(1, Math.min(100, Math.floor(Number(options.pageSize) || 20)));
    const keyword = normalizeText(options.keyword, "", 120).toLowerCase();
    const action = normalizeText(options.action, "", 120);
    const status = options.status === "success" || options.status === "failure" ? options.status : "";
    const actorId = normalizeText(options.actorId, "", 120);
    const targetType = normalizeText(options.targetType, "", 80);
    const start = parseDateStart(options.start);
    const end = parseDateEnd(options.end);
    const result = await postgresQuery(
        `
        SELECT *, count(*) OVER() AS total_count
        FROM audit_logs
        WHERE ($1 = '' OR lower(action) LIKE $2 OR lower(coalesce(actor_username, '')) LIKE $2 OR lower(coalesce(actor_ip, '')) LIKE $2 OR lower(coalesce(target_label, '')) LIKE $2)
          AND ($3 = '' OR action = $3)
          AND ($4 = '' OR status = $4)
          AND ($5 = '' OR actor_user_id = $5)
          AND ($6 = '' OR target_type = $6)
          AND ($7::timestamptz IS NULL OR created_at >= $7)
          AND ($8::timestamptz IS NULL OR created_at <= $8)
        ORDER BY created_at DESC
        LIMIT $9 OFFSET $10
        `,
        [keyword, `%${keyword}%`, action, status, actorId, targetType, start ? new Date(start).toISOString() : null, end ? new Date(end).toISOString() : null, pageSize, (page - 1) * pageSize],
    );
    return { items: result.rows.map(mapPostgresAuditLog), total: Number(result.rows[0]?.total_count || 0), page, pageSize };
}

async function insertPostgresAuditLog(log: StoredAuditLog, db: QueryExecutor = { query: postgresQuery }) {
    await ensurePostgresSchema();
    await db.query(
        `
        INSERT INTO audit_logs (
            id, action, status, actor_user_id, actor_username, actor_role, actor_ip, actor_user_agent,
            target_type, target_id, target_label, metadata, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `,
        [
            log.id,
            log.action,
            log.status,
            log.actor.id || null,
            log.actor.username || null,
            log.actor.role || null,
            log.actor.ip || null,
            log.actor.userAgent || null,
            log.target?.type || null,
            log.target?.id || null,
            log.target?.label || null,
            log.metadata ? JSON.stringify(log.metadata) : null,
            log.createdAt,
        ],
    );
}

function mapPostgresAuditLog(row: Record<string, unknown>): StoredAuditLog {
    return normalizeStoredLog({
        id: dbText(row.id),
        action: dbText(row.action),
        status: row.status === "failure" ? "failure" : "success",
        actor: {
            id: dbOptionalText(row.actor_user_id),
            username: dbOptionalText(row.actor_username),
            role: row.actor_role === "admin" || row.actor_role === "user" ? row.actor_role : undefined,
            ip: dbOptionalText(row.actor_ip),
            userAgent: dbOptionalText(row.actor_user_agent),
        },
        target: dbText(row.target_type)
            ? {
                  type: dbText(row.target_type),
                  id: dbOptionalText(row.target_id),
                  label: dbOptionalText(row.target_label),
              }
            : undefined,
        metadata: dbJson<Record<string, unknown> | undefined>(row.metadata, undefined),
        createdAt: dbIso(row.created_at),
    });
}

function dbText(value: unknown) {
    return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function dbOptionalText(value: unknown) {
    const text = dbText(value);
    return text || undefined;
}

function dbIso(value: unknown) {
    const date = value instanceof Date ? value : new Date(dbText(value));
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function dbJson<T>(value: unknown, fallback: T): T {
    if (value === null || value === undefined) return fallback;
    return value as T;
}

function normalizeDb(db: Partial<AuditLogDatabase>): AuditLogDatabase {
    return {
        version: 1,
        logs: Array.isArray(db.logs) ? db.logs.map(normalizeStoredLog).slice(0, MAX_AUDIT_LOGS) : [],
    };
}

function normalizeStoredLog(log: Partial<StoredAuditLog>): StoredAuditLog {
    return {
        id: normalizeText(log.id, randomUUID(), 120),
        action: normalizeAction(log.action),
        status: log.status === "failure" ? "failure" : "success",
        actor: normalizeActor(log.actor),
        target: normalizeTarget(log.target),
        metadata: normalizeMetadata(log.metadata),
        createdAt: normalizeTime(log.createdAt, new Date().toISOString()),
    };
}

function normalizeActor(actor: AuditLogActor | undefined): AuditLogActor {
    return {
        id: normalizeOptionalText(actor?.id, 120),
        username: normalizeOptionalText(actor?.username, 80),
        role: actor?.role === "admin" ? "admin" : actor?.role === "user" ? "user" : undefined,
        ip: normalizeOptionalText(actor?.ip, 120),
        userAgent: normalizeOptionalText(actor?.userAgent, 300),
    };
}

function normalizeTarget(target: AuditLogTarget | undefined): AuditLogTarget | undefined {
    const type = normalizeText(target?.type, "", 80);
    if (!type) return undefined;
    return {
        type,
        id: normalizeOptionalText(target?.id, 120),
        label: normalizeOptionalText(target?.label, 160),
    };
}

function normalizeMetadata(metadata: Record<string, unknown> | undefined) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
    const sanitized = sanitizeValue(metadata, 0);
    return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized) ? (sanitized as Record<string, unknown>) : undefined;
}

function sanitizeValue(value: unknown, depth: number): unknown {
    if (depth > 4) return "[truncated]";
    if (typeof value === "string") return normalizeText(value, "", 500);
    if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
    if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeValue(item, depth + 1));
    if (!value || typeof value !== "object") return undefined;

    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .slice(0, 80)
            .map(([key, item]) => {
                const cleanKey = normalizeText(key, "", 80);
                return [cleanKey, SECRET_KEY_PATTERN.test(cleanKey) ? "[redacted]" : sanitizeValue(item, depth + 1)];
            })
            .filter(([key]) => Boolean(key)),
    );
}

function normalizeAction(value: unknown) {
    return normalizeText(value, "unknown", 120).replace(/[^a-z0-9_.:-]/gi, "");
}

function normalizeText(value: unknown, fallback: string, maxLength: number) {
    const text = typeof value === "string" ? value.trim() : "";
    return (text || fallback).slice(0, maxLength);
}

function normalizeOptionalText(value: unknown, maxLength: number) {
    const text = normalizeText(value, "", maxLength);
    return text || undefined;
}

function normalizeTime(value: unknown, fallback: string | number) {
    const raw = typeof value === "number" ? value : typeof value === "string" ? value : fallback;
    const date = new Date(raw);
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function parseDateStart(value?: string) {
    if (!value) return 0;
    const date = new Date(`${value}T00:00:00`);
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function parseDateEnd(value?: string) {
    if (!value) return 0;
    const date = new Date(`${value}T23:59:59.999`);
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function emptyDb(): AuditLogDatabase {
    return { version: 1, logs: [] };
}
