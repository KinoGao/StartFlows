import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";

const HASH_ALGORITHM = "pbkdf2_sha256";
const ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";
const DUMMY_PASSWORD_HASH = `${HASH_ALGORITHM}$${ITERATIONS}$vozeb-pro-auth-dummy$bd3jzUHWM6ZtuhbdwvPKArj5YbI0kcc5Q3KjexiRKYw`;

function derivePasswordKey(password: string, salt: string, iterations: number, keyLength: number) {
    return new Promise<Buffer>((resolve, reject) => {
        pbkdf2(password, salt, iterations, keyLength, DIGEST, (error, key) => {
            if (error) reject(error);
            else resolve(key);
        });
    });
}

export async function hashPassword(password: string) {
    const salt = randomBytes(16).toString("base64url");
    const hash = (await derivePasswordKey(password, salt, ITERATIONS, KEY_LENGTH)).toString("base64url");
    return `${HASH_ALGORITHM}$${ITERATIONS}$${salt}$${hash}`;
}

export async function verifyPassword(password: string, storedHash: string) {
    const [algorithm, iterationsRaw, salt, hash] = storedHash.split("$");
    if (algorithm !== HASH_ALGORITHM || !iterationsRaw || !salt || !hash) return false;
    const iterations = Number(iterationsRaw);
    if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) return false;

    const expected = Buffer.from(hash, "base64url");
    if (expected.length !== KEY_LENGTH) return false;
    const actual = await derivePasswordKey(password, salt, iterations, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function verifyPasswordWithDummy(password: string, storedHash?: string) {
    const matched = await verifyPassword(password, storedHash || DUMMY_PASSWORD_HASH);
    return Boolean(storedHash && matched);
}
