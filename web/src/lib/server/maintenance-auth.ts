import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const MIN_TOKEN_LENGTH = 32;
const WORKER_USER_HEADER = "x-vozeb-pro-worker-user-id";
const WORKER_CONTEXT_PREFIX = "vozeb-worker-v1";

export function isMaintenanceTokenConfigured() {
    return maintenanceToken().length >= MIN_TOKEN_LENGTH;
}

export function isWorkerTokenConfigured() {
    const token = workerToken();
    return token.length >= MIN_TOKEN_LENGTH && token !== maintenanceToken();
}

export function isAuthorizedMaintenanceRequest(request: Request) {
    return isAuthorizedBearerRequest(request, maintenanceToken(), isMaintenanceTokenConfigured());
}

export function isAuthorizedWorkerRequest(request: Request) {
    return isAuthorizedBearerRequest(request, workerToken(), isWorkerTokenConfigured());
}

export function maintenanceWorkerHeaders(userId: string) {
    const token = workerToken();
    const normalizedUserId = userId.trim().slice(0, 160);
    if (!isWorkerTokenConfigured() || !normalizedUserId) throw new Error("生成任务 Worker 需要配置独立 Worker 令牌");
    return { authorization: `Bearer ${token}`, [WORKER_USER_HEADER]: normalizedUserId };
}

export function authorizedWorkerUserId(request: Request) {
    if (!isAuthorizedWorkerRequest(request)) return "";
    return request.headers.get(WORKER_USER_HEADER)?.trim().slice(0, 160) || "";
}

export function maintenanceWorkerContext(userId: string) {
    const token = workerToken();
    const normalizedUserId = userId.trim().slice(0, 160);
    if (!isWorkerTokenConfigured() || !normalizedUserId) throw new Error("生成任务 Worker 需要配置独立 Worker 令牌");
    const encodedUserId = Buffer.from(normalizedUserId, "utf8").toString("base64url");
    const signature = createHmac("sha256", token).update(`${WORKER_CONTEXT_PREFIX}:${encodedUserId}`).digest("base64url");
    return `${WORKER_CONTEXT_PREFIX}.${encodedUserId}.${signature}`;
}

export function maintenanceWorkerContextHeaders(value: string) {
    const [prefix, encodedUserId, signature] = value.split(".");
    const token = workerToken();
    if (prefix !== WORKER_CONTEXT_PREFIX || !isWorkerTokenConfigured() || !encodedUserId || !signature) return null;
    const expected = createHmac("sha256", token).update(`${WORKER_CONTEXT_PREFIX}:${encodedUserId}`).digest("base64url");
    if (!timingSafeEqual(digest(signature), digest(expected))) return null;
    let userId = "";
    try {
        userId = Buffer.from(encodedUserId, "base64url").toString("utf8").trim().slice(0, 160);
    } catch {
        return null;
    }
    return userId ? maintenanceWorkerHeaders(userId) : null;
}

export function requestRuntimeCredential(request: Request, userId: string) {
    const cookie = request.headers.get("cookie")?.trim();
    if (cookie) return cookie;
    const normalizedUserId = userId.trim().slice(0, 160);
    return normalizedUserId && authorizedWorkerUserId(request) === normalizedUserId ? maintenanceWorkerContext(normalizedUserId) : "";
}

function maintenanceToken() {
    return process.env.VOZEB_PRO_MAINTENANCE_TOKEN?.trim() || "";
}

function workerToken() {
    return process.env.VOZEB_PRO_WORKER_TOKEN?.trim() || "";
}

function isAuthorizedBearerRequest(request: Request, configured: string, ready: boolean) {
    if (!ready) return false;
    const authorization = request.headers.get("authorization")?.trim() || "";
    const provided = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
    return Boolean(provided) && timingSafeEqual(digest(configured), digest(provided));
}

function digest(value: string) {
    return createHash("sha256").update(value).digest();
}
