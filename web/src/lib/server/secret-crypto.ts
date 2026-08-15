import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENCRYPTED_SECRET_PREFIX = "vozeb-pro-secret:v1:";
const AES_256_GCM_KEY_BYTES = 32;
const AES_GCM_IV_BYTES = 12;

let cachedKey: { raw: string; key: Buffer | null } | undefined;

export function isEncryptedSecretValue(value: string) {
    return value.startsWith(ENCRYPTED_SECRET_PREFIX);
}

export function encryptSecretValue(value: string) {
    if (!value || isEncryptedSecretValue(value)) return value;
    const key = getEncryptionKey();
    if (!key) throw new Error("VOZEB_PRO_ENCRYPTION_KEY 未配置或格式无效，不能保存敏感配置");

    const iv = randomBytes(AES_GCM_IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENCRYPTED_SECRET_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecretValue(value: string) {
    if (!isEncryptedSecretValue(value)) return value;
    const key = getEncryptionKey();
    if (!key) throw new Error("VOZEB_PRO_ENCRYPTION_KEY 未配置或格式无效，不能解密敏感配置");

    try {
        const payload = value.slice(ENCRYPTED_SECRET_PREFIX.length);
        const [ivText, tagText, encryptedText] = payload.split(".");
        if (!ivText || !tagText || !encryptedText) throw new Error("敏感配置密文格式无效");
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
        decipher.setAuthTag(Buffer.from(tagText, "base64url"));
        return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
    } catch (error) {
        if (error instanceof Error && error.message === "敏感配置密文格式无效") throw error;
        throw new Error("敏感配置解密失败，请检查 VOZEB_PRO_ENCRYPTION_KEY 是否与加密时一致");
    }
}

export function getEncryptionKeyStatus() {
    const raw = process.env.VOZEB_PRO_ENCRYPTION_KEY?.trim() || "";
    if (!raw) return { ready: false, message: "缺少 VOZEB_PRO_ENCRYPTION_KEY。" };
    if (isPlaceholderKey(raw)) return { ready: false, message: "VOZEB_PRO_ENCRYPTION_KEY 仍是示例占位值。" };
    if (!parseConfiguredKey(raw)) return { ready: false, message: "VOZEB_PRO_ENCRYPTION_KEY 必须是 64 位十六进制或 32 字节 Base64。" };
    return { ready: true, message: "服务端敏感配置加密密钥已就绪。" };
}

export function isEncryptionKeyReady() {
    return getEncryptionKeyStatus().ready;
}

function getEncryptionKey() {
    const raw = process.env.VOZEB_PRO_ENCRYPTION_KEY?.trim() || "";
    if (cachedKey?.raw === raw) return cachedKey.key;
    const key = raw && !isPlaceholderKey(raw) ? parseConfiguredKey(raw) : null;
    cachedKey = { raw, key };
    return key;
}

function parseConfiguredKey(raw: string) {
    if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
    if (!/^[A-Za-z0-9+/]{43}=$/.test(raw)) return null;
    const decoded = Buffer.from(raw, "base64");
    return decoded.length === AES_256_GCM_KEY_BYTES ? decoded : null;
}

function isPlaceholderKey(raw: string) {
    return /^(?:change-this|replace-with|your-|example-|test-)/i.test(raw);
}
