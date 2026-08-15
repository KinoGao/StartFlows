import { createPostgresRepositories, isPostgresDatabaseEnabled } from "@/lib/server/database";

import { mutateAuthDb } from "./store-repository";

export type ExpiredAuthCleanupResult = {
    sessions: number;
    emailCodes: number;
};

export async function cleanupExpiredAuthRecords(input: { cleanupSessions: boolean; cleanupEmailCodes: boolean; limit: number; now?: Date }): Promise<ExpiredAuthCleanupResult> {
    const now = input.now || new Date();
    const limit = Math.max(1, Math.min(500, Math.floor(input.limit)));
    if (isPostgresDatabaseEnabled()) {
        const repositories = createPostgresRepositories();
        const [sessions, emailCodes] = await Promise.all([input.cleanupSessions ? repositories.sessions.pruneExpired(now, limit) : Promise.resolve(0), input.cleanupEmailCodes ? repositories.emailCodes.pruneExpired(now, limit) : Promise.resolve(0)]);
        return { sessions, emailCodes };
    }

    return mutateAuthDb((db) => {
        const expiredSessionIds = input.cleanupSessions ? expiredIds(db.sessions, (item) => item.expiresAt, now, limit) : new Set<string>();
        const expiredEmailCodeIds = input.cleanupEmailCodes ? expiredIds(db.emailCodes, (item) => item.consumedAt || item.expiresAt, now, limit) : new Set<string>();
        db.sessions = db.sessions.filter((item) => !expiredSessionIds.has(item.id));
        db.emailCodes = db.emailCodes.filter((item) => !expiredEmailCodeIds.has(item.id));
        return { sessions: expiredSessionIds.size, emailCodes: expiredEmailCodeIds.size };
    });
}

function expiredIds<T extends { id: string }>(items: T[], expiresAt: (item: T) => string, now: Date, limit: number) {
    const nowMs = now.getTime();
    return new Set(
        items
            .filter((item) => Date.parse(expiresAt(item)) <= nowMs)
            .toSorted((left, right) => expiresAt(left).localeCompare(expiresAt(right)) || left.id.localeCompare(right.id))
            .slice(0, limit)
            .map((item) => item.id),
    );
}
