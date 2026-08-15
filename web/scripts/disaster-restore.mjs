import { lstat, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

import { loadDisasterObjectStorageConfig, restoreObjectStorage } from "./disaster-object-storage.mjs";
import {
    copyDirectorySnapshot,
    ensureNewDirectory,
    LOCAL_MEDIA_ROOTS,
    parseCliArguments,
    postgresDatabaseName,
    readRecoveryManifest,
    requireOfflineConfirmation,
    resolveWithin,
    runPostgresTool,
    verifyRecoveryPoint,
    writeJsonAtomic,
} from "./disaster-recovery-core.mjs";

const options = parseCliArguments(process.argv.slice(2));

try {
    requireOfflineConfirmation(options);
    const recoveryPointDir = path.resolve(options.input || options.positional[0] || "");
    if (!options.input && !options.positional[0]) throw new Error("用法：pnpm restore:disaster -- --input <恢复点目录> --safety-dir <独立安全目录> --confirm <恢复点 ID> --confirm-offline");
    const manifest = await readRecoveryManifest(recoveryPointDir);
    if (options.confirm !== manifest.recoveryPointId) throw new Error("必须通过 --confirm 提供恢复点清单中的完整 ID");
    await verifyRecoveryPoint(recoveryPointDir, manifest);

    const databaseUrl = process.env.DATABASE_URL?.trim() || "";
    if (!databaseUrl) throw new Error("完整灾难恢复仅支持配置 DATABASE_URL 的 PostgreSQL 部署");
    const dataDir = path.resolve(process.env.VOZEB_PRO_DATA_DIR || path.join(process.cwd(), ".data"));
    const safetyDir = await ensureNewDirectory(options["safety-dir"] || path.join(path.dirname(recoveryPointDir), `pre-restore-${manifest.recoveryPointId}`));
    assertIndependentSafetyDirectory(safetyDir, dataDir, recoveryPointDir);
    const startedAt = new Date().toISOString();

    const safetyDatabasePath = path.join(safetyDir, "database-before-restore.dump");
    await runPostgresTool(process.env.VOZEB_PRO_PG_DUMP_PATH || "pg_dump", ["--format=custom", "--compress=6", "--no-owner", "--no-privileges", "--file", safetyDatabasePath], databaseUrl);
    for (const name of LOCAL_MEDIA_ROOTS) await copyDirectorySnapshot(path.join(dataDir, name), path.join(safetyDir, "local-media", name));

    const databaseDump = resolveWithin(recoveryPointDir, manifest.database.file);
    await runPostgresTool(
        process.env.VOZEB_PRO_PG_RESTORE_PATH || "pg_restore",
        ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--exit-on-error", "--single-transaction", "--dbname", postgresDatabaseName(databaseUrl), databaseDump],
        databaseUrl,
    );
    await restoreLocalMedia(recoveryPointDir, dataDir, manifest);

    const objectStorageConfig = await loadDisasterObjectStorageConfig({ databaseUrl, dataDir, encryptionKey: process.env.VOZEB_PRO_ENCRYPTION_KEY });
    const objectStorage = await restoreObjectStorage(objectStorageConfig, manifest.objectStorage, recoveryPointDir);
    await writeJsonAtomic(path.join(safetyDir, "restore-report.json"), {
        app: "VOZEB PRO",
        recoveryPointId: manifest.recoveryPointId,
        startedAt,
        completedAt: new Date().toISOString(),
        safetyDirectory: safetyDir,
        objectStorage,
        verificationRequired: true,
    });
    process.stdout.write(`恢复已执行：${manifest.recoveryPointId}\n恢复前安全副本：${safetyDir}\n请按文档完成数据库、媒体、登录、生成和支付只读核验后再启动 Worker。\n`);
} catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
}

async function restoreLocalMedia(recoveryPointDir, dataDir, manifest) {
    const stagingDir = path.join(path.dirname(dataDir), `.vozeb-restore-${manifest.recoveryPointId}`);
    const rollbackDir = path.join(path.dirname(dataDir), `.vozeb-restore-rollback-${manifest.recoveryPointId}`);
    await rm(stagingDir, { recursive: true, force: true });
    await rm(rollbackDir, { recursive: true, force: true });
    await mkdir(stagingDir, { recursive: true });
    try {
        for (const root of manifest.localMedia?.roots || []) {
            if (!LOCAL_MEDIA_ROOTS.includes(root.name)) throw new Error(`恢复点包含未知媒体目录：${root.name}`);
            if (root.present) await copyDirectorySnapshot(path.join(recoveryPointDir, "local-media", root.name), path.join(stagingDir, root.name));
            else await mkdir(path.join(stagingDir, root.name), { recursive: true });
        }
        await mkdir(dataDir, { recursive: true });
        await mkdir(rollbackDir, { recursive: true });
        const replaced = [];
        try {
            for (const name of LOCAL_MEDIA_ROOTS) {
                const target = path.join(dataDir, name);
                if (await pathExists(target)) await rename(target, path.join(rollbackDir, name));
                await rename(path.join(stagingDir, name), target);
                replaced.push(name);
            }
        } catch (error) {
            for (const name of replaced.reverse()) {
                await rm(path.join(dataDir, name), { recursive: true, force: true });
                if (await pathExists(path.join(rollbackDir, name))) await rename(path.join(rollbackDir, name), path.join(dataDir, name));
            }
            for (const name of LOCAL_MEDIA_ROOTS) {
                if (!(await pathExists(path.join(dataDir, name))) && (await pathExists(path.join(rollbackDir, name)))) await rename(path.join(rollbackDir, name), path.join(dataDir, name));
            }
            throw error;
        }
        await rm(rollbackDir, { recursive: true, force: true });
    } finally {
        await rm(stagingDir, { recursive: true, force: true });
    }
}

function assertIndependentSafetyDirectory(safetyDir, dataDir, recoveryPointDir) {
    for (const protectedRoot of [dataDir, recoveryPointDir]) {
        const relative = path.relative(protectedRoot, safetyDir);
        if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))) throw new Error("恢复前安全目录必须位于业务数据目录和恢复点目录之外");
    }
}

async function pathExists(target) {
    try {
        await lstat(target);
        return true;
    } catch (error) {
        if (error?.code === "ENOENT") return false;
        throw error;
    }
}
