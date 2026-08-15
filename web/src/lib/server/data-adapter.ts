import { copyFile, mkdir, open, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

import { resolveServerDataPath } from "@/lib/server/data-dir";

type DataDirectoryEntry = {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
};

const globalDataAdapter = globalThis as typeof globalThis & { __vozebProDataFileWriteQueues?: Map<string, Promise<void>> };
const dataFileWriteQueues = (globalDataAdapter.__vozebProDataFileWriteQueues ??= new Map<string, Promise<void>>());

export function resolveDataPath(pathName: string) {
    return resolveServerDataPath(pathName);
}

export async function ensureDataDirectory(pathName: string) {
    await mkdir(resolveServerDataPath(pathName), { recursive: true });
}

export async function readJsonDataFile<T>(fileName: string, fallback: T): Promise<T> {
    try {
        const raw = await readFile(resolveServerDataPath(fileName), "utf8");
        return JSON.parse(raw.trimStart().replace(/^\uFEFF/, "")) as T;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
        throw error;
    }
}

export async function writeJsonDataFile(fileName: string, value: unknown) {
    const filePath = resolveServerDataPath(fileName);
    const previous = dataFileWriteQueues.get(filePath) || Promise.resolve();
    const write = previous.catch(() => undefined).then(() => writeJsonFileAtomically(filePath, value));
    dataFileWriteQueues.set(filePath, write);
    try {
        await write;
    } finally {
        if (dataFileWriteQueues.get(filePath) === write) dataFileWriteQueues.delete(filePath);
    }
}

export async function withJsonDataFileLock<T>(fileName: string, callback: () => Promise<T>, options: { timeoutMs?: number } = {}) {
    const lockPath = `${resolveServerDataPath(fileName)}.lock`;
    const deadline = Date.now() + Math.max(1_000, options.timeoutMs ?? 30_000);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    while (!handle) {
        try {
            await mkdir(dirname(lockPath), { recursive: true });
            handle = await open(lockPath, "wx");
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code || "";
            if (!["EEXIST", "EACCES", "EBUSY", "EPERM"].includes(code) || Date.now() >= deadline) throw error;
            try {
                const details = await stat(lockPath);
                if (Date.now() - details.mtimeMs > 60_000) await unlink(lockPath);
            } catch {
                // The owner may have released the lock between stat and unlink.
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }
    try {
        return await callback();
    } finally {
        await handle.close().catch(() => undefined);
        await unlink(lockPath).catch(() => undefined);
    }
}

export function withJsonDataFileLocks<T>(fileNames: string[], callback: () => Promise<T>, options: { timeoutMs?: number } = {}) {
    const names = Array.from(new Set(fileNames.map((name) => name.trim()).filter(Boolean))).sort();
    const acquire = (index: number): Promise<T> => (index >= names.length ? callback() : withJsonDataFileLock(names[index], () => acquire(index + 1), options));
    return acquire(0);
}

export async function copyDataFile(sourceFileName: string, targetFileName: string) {
    const targetPath = resolveServerDataPath(targetFileName);
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(resolveServerDataPath(sourceFileName), targetPath);
}

export async function listDataDirectory(pathName: string): Promise<DataDirectoryEntry[]> {
    return readdir(resolveServerDataPath(pathName), { withFileTypes: true });
}

export async function removeDataPath(pathName: string) {
    await rm(resolveServerDataPath(pathName), { recursive: true, force: true });
}

async function writeJsonFileAtomically(filePath: string, value: unknown) {
    await mkdir(dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
        await renameWithRetry(temporaryPath, filePath);
    } finally {
        await unlink(temporaryPath).catch(() => undefined);
    }
}

async function renameWithRetry(source: string, target: string) {
    const deadline = Date.now() + 2_000;
    let delayMs = 5;
    while (true) {
        try {
            await rename(source, target);
            return;
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (!code || !["EACCES", "EBUSY", "EPERM"].includes(code) || Date.now() >= deadline) throw error;
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            delayMs = Math.min(100, delayMs * 2);
        }
    }
}
