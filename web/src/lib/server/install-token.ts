import { createHash, timingSafeEqual } from "node:crypto";

const INSTALL_TOKEN_ENV = "VOZEB_PRO_INSTALL_TOKEN";
const INSTALL_TOKEN_MIN_LENGTH = 32;
const INSTALL_TOKEN_MAX_LENGTH = 512;

export type InstallTokenStatus = {
    ready: boolean;
    message: string;
};

export function getInstallTokenStatus(): InstallTokenStatus {
    const ready = normalizeInstallToken(process.env[INSTALL_TOKEN_ENV]) !== null;
    return {
        ready,
        message: ready ? "一次性安装令牌已就绪。" : `请在服务器配置至少 ${INSTALL_TOKEN_MIN_LENGTH} 个字符的 ${INSTALL_TOKEN_ENV}。`,
    };
}

export function verifyInstallToken(candidate: unknown) {
    const expected = normalizeInstallToken(process.env[INSTALL_TOKEN_ENV]);
    const submitted = normalizeInstallToken(candidate);
    if (!expected || !submitted) return false;
    return timingSafeEqual(digest(expected), digest(submitted));
}

export function assertInstallToken(candidate: unknown) {
    if (!getInstallTokenStatus().ready) throw new InstallTokenError(`服务器尚未配置有效的 ${INSTALL_TOKEN_ENV}`, 503);
    if (!verifyInstallToken(candidate)) throw new InstallTokenError("安装令牌无效", 403);
}

export class InstallTokenError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

function normalizeInstallToken(value: unknown) {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return normalized.length >= INSTALL_TOKEN_MIN_LENGTH && normalized.length <= INSTALL_TOKEN_MAX_LENGTH ? normalized : null;
}

function digest(value: string) {
    return createHash("sha256").update(value, "utf8").digest();
}
