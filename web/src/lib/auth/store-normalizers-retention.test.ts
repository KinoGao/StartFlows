import { describe, expect, it } from "vitest";

import { normalizeDb } from "./store-normalizers";

describe("file auth database normalization", () => {
    it("does not silently delete expired technical records or truncate business history", () => {
        const createdAt = "2020-01-01T00:00:00.000Z";
        const normalized = normalizeDb({
            sessions: [{ id: "expired", userId: "user", tokenHash: "hash", createdAt, expiresAt: createdAt }],
            quotaUsage: [{ userId: "user", date: "2020-01-01", usageKind: "text", pointsSpent: 1, units: 1, updatedAt: createdAt }],
            pointRecords: Array.from({ length: 10_001 }, (_, index) => ({
                id: `point-${index}`,
                userId: "user",
                type: "consume" as const,
                amount: -1,
                balanceAfter: 0,
                permanentAmount: -1,
                dailyAmount: 0,
                permanentBalanceAfter: 0,
                dailyBalanceAfter: 0,
                description: "测试流水",
                createdAt,
            })),
            emailCodes: [{ id: "expired", purpose: "register", email: "expired@example.com", codeHash: "hash", createdAt, expiresAt: createdAt }],
            announcements: Array.from({ length: 201 }, (_, index) => ({ id: `announcement-${index}`, title: `公告 ${index}`, content: "内容", enabled: true, popupHome: false, popupAfterLogin: false, createdAt, updatedAt: createdAt })),
        });

        expect(normalized.sessions).toHaveLength(1);
        expect(normalized.emailCodes).toHaveLength(1);
        expect(normalized.quotaUsage).toHaveLength(1);
        expect(normalized.pointRecords).toHaveLength(10_001);
        expect(normalized.announcements).toHaveLength(201);
    });
});
