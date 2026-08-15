import { deleteUserByAdmin, getAuthSettings } from "@/lib/auth/store";
import { getDatabaseProvider } from "@/lib/server/database";
import { deleteGenerationLogsByUserId } from "@/lib/server/generation-log-store";
import { deleteRegisteredLocalMediaSnapshots } from "@/lib/server/local-media-storage";
import { listLocalMediaRegistrationsForDeletion, type LocalMediaRegistration } from "@/lib/server/local-media-registry";

export async function deleteAdminUserWithMediaCleanup(actorIdValue: unknown, userIdValue: unknown) {
    const actorId = normalizeId(actorIdValue);
    const userId = normalizeId(userIdValue);
    if (!actorId || !userId) throw new Error("管理员和用户标识不能为空");

    const { dataLifecycle } = await getAuthSettings();
    let snapshots: LocalMediaRegistration[] = [];
    if (getDatabaseProvider() === "postgres") {
        await deleteUserByAdmin(actorId, userId, {
            beforeDelete: async (client, lockedUserId) => {
                snapshots = await listLocalMediaRegistrationsForDeletion(lockedUserId, { batchSize: dataLifecycle.maintenanceBatchSize, executor: client, forUpdate: true });
            },
        });
        await deleteRegisteredLocalMediaSnapshots(snapshots);
        return { ok: true };
    }

    snapshots = await listLocalMediaRegistrationsForDeletion(userId, { batchSize: dataLifecycle.maintenanceBatchSize });
    await deleteUserByAdmin(actorId, userId);
    try {
        await deleteGenerationLogsByUserId(userId);
    } finally {
        await deleteRegisteredLocalMediaSnapshots(snapshots);
    }
    return { ok: true };
}

function normalizeId(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
