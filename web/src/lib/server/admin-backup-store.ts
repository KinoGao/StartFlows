import { normalizeDb as normalizeAuthDb } from "@/lib/auth/store-normalizers";
import { readAuthDb, readPostgresAuthDb, writeAuthDb } from "@/lib/auth/store-repository";
import { restorePostgresAuthSnapshot } from "@/lib/server/admin-backup-auth-restore";
import { mergeAccountConfigBackup, type AdminBackupData } from "@/lib/server/admin-backup-merge";
import { readPromptBackup, readPostgresPromptDb, upsertPostgresPromptDbWithExecutor, writePromptBackup } from "@/lib/prompts/store";
import { ensurePostgresSchema, getDatabaseProvider, withPostgresTransaction, type QueryExecutor } from "@/lib/server/database";
import { readGenerationLogDb, readPostgresGenerationLogDb, upsertPostgresGenerationLogDbWithExecutor, writeGenerationLogDb } from "@/lib/server/generation-log-repository";
import { readAccountDeletionRequestBackup, upsertAccountDeletionRequestBackup, writeAccountDeletionRequestBackup } from "@/lib/server/database/account-deletion-request-repository";

export type { AdminBackupData } from "@/lib/server/admin-backup-merge";

export type AdminBackupRestoreMode = "account-config" | "disaster";

let fileRestoreQueue = Promise.resolve();

export async function readAdminBackupData(): Promise<AdminBackupData> {
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        return withPostgresTransaction(readPostgresBackupData);
    }
    return readFileBackupData();
}

export async function restoreAdminBackupData(data: AdminBackupData, options: { mode?: AdminBackupRestoreMode } = {}) {
    const mode = options.mode || "account-config";
    if (mode === "disaster") throw new Error("当前业务 JSON 备份不包含完整数据库、媒体和对象存储清单，不能用于整库灾难恢复");
    const imported = { ...data, auth: normalizeAuthDb(data.auth) };
    if (getDatabaseProvider() === "postgres") {
        await ensurePostgresSchema();
        await withPostgresTransaction(async (client) => {
            await lockPostgresBackupTables(client);
            const merged = mergeAccountConfigBackup(await readPostgresBackupData(client), imported);
            await restorePostgresBackup(client, merged);
        });
        return;
    }
    const run = fileRestoreQueue.then(() => restoreFileBackup(imported));
    fileRestoreQueue = run.then(
        () => undefined,
        () => undefined,
    );
    await run;
}

async function readPostgresBackupData(client: QueryExecutor): Promise<AdminBackupData> {
    const [auth, prompts, generationLogs, accountDeletionRequests] = await Promise.all([readPostgresAuthDb(client), readPostgresPromptDb(client), readPostgresGenerationLogDb(client), readAccountDeletionRequestBackup(client)]);
    return { auth, prompts, generationLogs, accountDeletionRequests };
}

async function readFileBackupData(): Promise<AdminBackupData> {
    const [auth, prompts, generationLogs, accountDeletionRequests] = await Promise.all([readAuthDb(), readPromptBackup(), readGenerationLogDb(), readAccountDeletionRequestBackup()]);
    return { auth, prompts, generationLogs, accountDeletionRequests };
}

async function restorePostgresBackup(client: QueryExecutor, data: AdminBackupData) {
    await restorePostgresAuthSnapshot(client, data.auth);
    await upsertPostgresPromptDbWithExecutor(data.prompts, client);
    await upsertPostgresGenerationLogDbWithExecutor(data.generationLogs, client);
    await upsertAccountDeletionRequestBackup(data.accountDeletionRequests, client);
}

async function restoreFileBackup(imported: AdminBackupData) {
    const current = await readFileBackupData();
    const merged = mergeAccountConfigBackup(current, imported);
    try {
        await writeFileBackupData(merged);
    } catch (restoreError) {
        const rollbackErrors = await rollbackFileBackup(current);
        if (rollbackErrors.length) throw new AggregateError([restoreError, ...rollbackErrors], "备份恢复失败，且文件 Provider 未能完整回滚，请使用恢复前安全副本处理");
        throw restoreError;
    }
}

async function writeFileBackupData(data: AdminBackupData) {
    await writeAuthDb(data.auth);
    await writePromptBackup(data.prompts);
    await writeGenerationLogDb(data.generationLogs);
    await writeAccountDeletionRequestBackup(data.accountDeletionRequests);
}

async function rollbackFileBackup(data: AdminBackupData) {
    const errors: unknown[] = [];
    for (const write of [() => writeAuthDb(data.auth), () => writePromptBackup(data.prompts), () => writeGenerationLogDb(data.generationLogs), () => writeAccountDeletionRequestBackup(data.accountDeletionRequests)]) {
        try {
            await write();
        } catch (error) {
            errors.push(error);
        }
    }
    return errors;
}

async function lockPostgresBackupTables(client: QueryExecutor) {
    await client.query(`
        LOCK TABLE
            app_settings, entitlement_plans, system_model_channels, users, sessions, email_codes,
            quota_usage, point_records, daily_plan_point_wallets, cdk_codes, cdk_redemptions,
            announcements, prompts, prompt_seed_sources, generation_logs, generation_log_assets,
            account_deletion_requests
        IN SHARE ROW EXCLUSIVE MODE
    `);
}
