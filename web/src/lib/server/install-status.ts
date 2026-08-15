import { DEFAULT_SITE_SETTINGS, getPublicUserSummary } from "@/lib/auth/store";
import { getDatabaseProvider, getPostgresConnectionString, initializePostgresSchema, postgresQuery } from "@/lib/server/database";
import { assertInstallToken, getInstallTokenStatus, InstallTokenError } from "@/lib/server/install-token";
import { getEncryptionKeyStatus } from "@/lib/server/secret-crypto";

export type InstallStatus = {
    provider: "file" | "postgres";
    ready: boolean;
    firstAdminRequired: boolean;
    userCount: number;
    site: typeof DEFAULT_SITE_SETTINGS;
    security: {
        encryptionReady: boolean;
        installTokenReady: boolean;
        installTokenMessage: string;
        message: string;
    };
    database: {
        configured: boolean;
        healthy: boolean;
        schemaReady: boolean;
        connectionEnv: "DATABASE_URL" | "POSTGRES_URL" | null;
        message: string;
        detail?: string;
    };
};

const READY_CACHE_TTL_MS = 15_000;
const UNHEALTHY_CACHE_TTL_MS = 2_000;
const globalForInstallStatus = globalThis as typeof globalThis & {
    __vozebProInstallStatusCache?: {
        key: string;
        value?: InstallStatus;
        expiresAt: number;
        pending?: Promise<InstallStatus>;
    };
};

export async function getInstallStatus(): Promise<InstallStatus> {
    const provider = getDatabaseProvider();
    const encryption = getEncryptionKeyStatus();
    const key = `${provider}:${provider === "postgres" ? getPostgresConnectionString() : ""}:${encryption.ready}`;
    const now = Date.now();
    const cached = globalForInstallStatus.__vozebProInstallStatusCache;
    if (cached?.key === key) {
        if (cached.value && cached.expiresAt > now) return cached.value;
        if (cached.pending) return cached.pending;
    }

    const pending = loadInstallStatus(provider, encryption);
    globalForInstallStatus.__vozebProInstallStatusCache = { key, expiresAt: 0, pending };
    try {
        const value = await pending;
        const ttl = value.firstAdminRequired ? 0 : value.ready ? READY_CACHE_TTL_MS : UNHEALTHY_CACHE_TTL_MS;
        globalForInstallStatus.__vozebProInstallStatusCache = { key, value: ttl ? value : undefined, expiresAt: ttl ? Date.now() + ttl : 0 };
        return value;
    } catch (error) {
        globalForInstallStatus.__vozebProInstallStatusCache = undefined;
        throw error;
    }
}

export function invalidateInstallStatusCache() {
    globalForInstallStatus.__vozebProInstallStatusCache = undefined;
}

async function loadInstallStatus(provider: "file" | "postgres", encryption = getEncryptionKeyStatus()): Promise<InstallStatus> {
    const installToken = getInstallTokenStatus();
    if (provider === "file") {
        try {
            const users = await getPublicUserSummary();
            return buildStatus({
                provider,
                userCount: users.total,
                security: { encryptionReady: encryption.ready, installTokenReady: installToken.ready, installTokenMessage: installToken.message, message: encryption.message },
                database: {
                    configured: true,
                    healthy: true,
                    schemaReady: true,
                    connectionEnv: null,
                    message: "本地文件存储可用。适合单机体验，商业化部署建议切换到 PostgreSQL。",
                },
            });
        } catch (error) {
            console.error("File install status check failed", error);
            return buildStatus({
                provider,
                userCount: 0,
                security: { encryptionReady: encryption.ready, installTokenReady: installToken.ready, installTokenMessage: installToken.message, message: encryption.message },
                database: {
                    configured: true,
                    healthy: false,
                    schemaReady: false,
                    connectionEnv: null,
                    message: "本地文件存储不可用。",
                    detail: "完整错误已写入服务器日志。",
                },
            });
        }
    }

    const connectionEnv = postgresConnectionEnv();
    if (!getPostgresConnectionString()) {
        return buildStatus({
            provider,
            userCount: 0,
            security: { encryptionReady: encryption.ready, installTokenReady: installToken.ready, installTokenMessage: installToken.message, message: encryption.message },
            database: {
                configured: false,
                healthy: false,
                schemaReady: false,
                connectionEnv,
                message: "缺少 PostgreSQL 连接配置。请在服务器环境变量、.env.local 或 Docker Compose 中填写 DATABASE_URL。",
                detail: "本机部署通常是 postgres://用户名:密码@localhost:5432/vozeb_pro；Docker Compose 通常是 postgres://用户名:密码@postgres:5432/vozeb_pro。",
            },
        });
    }

    try {
        await postgresQuery("SELECT 1");
    } catch (error) {
        console.error("PostgreSQL install connection check failed", error);
        return buildStatus({
            provider,
            userCount: 0,
            security: { encryptionReady: encryption.ready, installTokenReady: installToken.ready, installTokenMessage: installToken.message, message: encryption.message },
            database: {
                configured: true,
                healthy: false,
                schemaReady: false,
                connectionEnv,
                message: "无法连接 PostgreSQL。请检查数据库、账号密码、Host、端口、网络和 SSL 设置。",
                detail: "完整错误已写入服务器日志。",
            },
        });
    }

    try {
        const schema = await postgresQuery<{ table_name: string | null }>("SELECT to_regclass('public.users')::text AS table_name");
        if (!schema.rows[0]?.table_name) {
            return buildStatus({
                provider,
                userCount: 0,
                security: { encryptionReady: encryption.ready, installTokenReady: installToken.ready, installTokenMessage: installToken.message, message: encryption.message },
                database: {
                    configured: true,
                    healthy: true,
                    schemaReady: false,
                    connectionEnv,
                    message: "PostgreSQL 连接可用，等待显式初始化表结构。",
                },
            });
        }
        const result = await postgresQuery<{ total: string | number }>("SELECT count(*) AS total FROM users");
        const userCount = Number(result.rows[0]?.total || 0);
        return buildStatus({
            provider,
            userCount,
            security: { encryptionReady: encryption.ready, installTokenReady: installToken.ready, installTokenMessage: installToken.message, message: encryption.message },
            database: {
                configured: true,
                healthy: true,
                schemaReady: true,
                connectionEnv,
                message: "PostgreSQL 连接可用，表结构已完成初始化。",
            },
        });
    } catch (error) {
        console.error("PostgreSQL install schema check failed", error);
        return buildStatus({
            provider,
            userCount: 0,
            security: { encryptionReady: encryption.ready, installTokenReady: installToken.ready, installTokenMessage: installToken.message, message: encryption.message },
            database: {
                configured: true,
                healthy: false,
                schemaReady: false,
                connectionEnv,
                message: "PostgreSQL 已连接，但表结构状态检查失败。",
                detail: "完整错误已写入服务器日志。",
            },
        });
    }
}

export async function initializeInstallDatabase(installToken: unknown) {
    if (getDatabaseProvider() !== "postgres") throw new InstallInitializationError("当前存储模式不需要初始化 PostgreSQL", 409);
    if (!getPostgresConnectionString()) throw new InstallInitializationError("请先配置 DATABASE_URL", 400);
    const currentStatus = await getInstallStatus();
    if (currentStatus.userCount > 0) throw new InstallInitializationError("项目已完成安装，禁止重复初始化数据库", 409);
    try {
        assertInstallToken(installToken);
    } catch (error) {
        if (error instanceof InstallTokenError) throw new InstallInitializationError(error.message, error.status);
        throw error;
    }
    if (!getEncryptionKeyStatus().ready) throw new InstallInitializationError("请先配置有效的 VOZEB_PRO_ENCRYPTION_KEY", 400);
    try {
        await initializePostgresSchema();
    } catch (error) {
        console.error("PostgreSQL install initialization failed", error);
        throw new InstallInitializationError("数据库初始化失败，请查看服务器日志并检查数据库账号权限", 500);
    }
    invalidateInstallStatusCache();
    return getInstallStatus();
}

export class InstallInitializationError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

function buildStatus(input: Omit<InstallStatus, "ready" | "firstAdminRequired" | "site">): InstallStatus {
    const runtimeReady = input.database.healthy && input.database.schemaReady && input.security.encryptionReady;
    const firstAdminRequired = runtimeReady && input.security.installTokenReady && input.userCount === 0;
    return {
        ...input,
        ready: runtimeReady && input.userCount > 0,
        firstAdminRequired,
        site: DEFAULT_SITE_SETTINGS,
    };
}

function postgresConnectionEnv() {
    if (process.env.DATABASE_URL?.trim()) return "DATABASE_URL";
    if (process.env.POSTGRES_URL?.trim()) return "POSTGRES_URL";
    return null;
}
