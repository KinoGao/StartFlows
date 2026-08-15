import { createPostgresRepositories, ensurePostgresSchema, isPostgresDatabaseEnabled, withPostgresTransaction } from "@/lib/server/database";
import { walletClock } from "@/lib/server/points-wallet-service";

import { AuthInputError } from "./store-foundation";
import { readAuthDb, mutateAuthDb } from "./store-repository";
import { publicUserFromAuthenticatedRecord, toPublicUser } from "./store-user-projection";

export async function updateOwnAvatarStorageKey(userId: string, avatarStorageKey: string) {
    const storageKey = avatarStorageKey.trim();
    if (!/^permanent\/\d{4}\/\d{2}\/\d{2}\/images\/.+\.webp$/i.test(storageKey)) throw new AuthInputError("头像存储格式无效");
    if (isPostgresDatabaseEnabled()) {
        await ensurePostgresSchema();
        const clock = walletClock();
        const result = await withPostgresTransaction(async (client) => {
            const users = createPostgresRepositories(client).users;
            const user = await users.getById(userId, true);
            if (!user || user.status !== "active") throw new AuthInputError("用户不可用");
            await users.update(userId, { avatarStorageKey: storageKey });
            const publicRecord = (await users.getPublicDetails([userId], { now: clock.now.toISOString(), date: clock.date }))[0];
            if (!publicRecord) throw new AuthInputError("用户不可用");
            return { user: publicUserFromAuthenticatedRecord(publicRecord, clock.expiresAt), previousStorageKey: user.avatarStorageKey };
        });
        return result;
    }
    return mutateAuthDb((db) => {
        const user = db.users.find((item) => item.id === userId);
        if (!user || user.status !== "active") throw new AuthInputError("用户不可用");
        const previousStorageKey = user.avatarStorageKey;
        user.avatarStorageKey = storageKey;
        user.updatedAt = new Date().toISOString();
        return { user: toPublicUser(user, db), previousStorageKey };
    });
}

export async function getPublicAvatarStorageKey(identity: string) {
    const value = identity.trim();
    if (!value) return undefined;
    if (isPostgresDatabaseEnabled()) {
        await ensurePostgresSchema();
        const user = await createPostgresRepositories().users.getByPublicIdentity(value);
        return user?.status === "active" ? user.avatarStorageKey : undefined;
    }
    const user = (await readAuthDb()).users.find((item) => item.username.toLowerCase() === value.toLowerCase() || item.id === value);
    return user?.status === "active" ? user.avatarStorageKey : undefined;
}
