import { describe, expect, it, vi } from "vitest";

import { normalizeStoredLog, readPostgresGenerationLogDb } from "./generation-log-repository";

function storedLogWithAssets(count: number) {
    return normalizeStoredLog({
        id: "image-workbench:batch",
        userId: "user-1",
        username: "user",
        displayName: "User",
        kind: "image",
        source: "image-workbench",
        status: "success",
        title: "Batch",
        prompt: "Prompt",
        model: "image-model",
        summary: "Done",
        durationMs: 100,
        count,
        successCount: count,
        failCount: 0,
        assets: Array.from({ length: count }, (_, index) => ({ type: "image" as const, url: `/api/generation-log-assets/result-${index}.png` })),
        createdAt: "2026-07-28T00:00:00.000Z",
        updatedAt: "2026-07-28T00:00:00.000Z",
    });
}

describe("generation log asset normalization", () => {
    it("keeps all eight successful images in a workbench batch", () => {
        expect(storedLogWithAssets(8).assets).toHaveLength(8);
    });

    it("retains every successful asset in a large provider batch", () => {
        expect(storedLogWithAssets(205).assets).toHaveLength(205);
    });

    it("persists the public user prompt separately from task prompts", () => {
        const log = normalizeStoredLog({
            ...storedLogWithAssets(1),
            prompt: "内部执行提示词",
            requestSnapshot: {
                version: 1,
                userPrompt: "用户原始需求",
                parameters: {},
                references: [],
                slots: [{ id: "slot-1", index: 0, status: "pending", prompt: "内部执行提示词", clientRequestId: "image-workbench:conversation:slot-1", canRetry: true }],
            },
        });

        expect(log.prompt).toBe("内部执行提示词");
        expect(log.requestSnapshot).toMatchObject({ userPrompt: "用户原始需求", slots: [{ prompt: "内部执行提示词", clientRequestId: "image-workbench:conversation:slot-1", canRetry: true }] });
    });

    it("preserves long public and execution prompts at the generation contract lengths", () => {
        const publicPrompt = "原".repeat(4000);
        const executionPrompt = "执".repeat(5000);
        const log = normalizeStoredLog({
            ...storedLogWithAssets(1),
            prompt: executionPrompt,
            requestSnapshot: {
                version: 1,
                userPrompt: publicPrompt,
                parameters: {},
                references: [],
                slots: [{ id: "slot-1", index: 0, status: "pending", prompt: executionPrompt, clientRequestId: "request-slot-1" }],
            },
        });

        expect(log.prompt).toBe(executionPrompt);
        expect(log.requestSnapshot?.userPrompt).toBe(publicPrompt);
        expect(log.requestSnapshot?.slots[0]?.prompt).toBe(executionPrompt);
    });

    it("keeps every explicit reference in the request snapshot", () => {
        const references = Array.from({ length: 40 }, (_, index) => ({
            id: `reference-${index}`,
            kind: "image" as const,
            name: `reference-${index}.png`,
            mimeType: "image/png",
            url: `/api/reference-assets/reference-${index}.png`,
        }));
        const log = normalizeStoredLog({
            ...storedLogWithAssets(1),
            requestSnapshot: { version: 1, userPrompt: "生成组合图", parameters: {}, references, slots: [] },
        });

        expect(log.requestSnapshot?.references).toHaveLength(40);
    });

    it("exports the complete PostgreSQL generation log snapshot", async () => {
        const query = vi.fn().mockResolvedValue({ rows: [] });

        await readPostgresGenerationLogDb({ query } as never);

        expect(query).toHaveBeenNthCalledWith(1, "SELECT * FROM generation_logs ORDER BY created_at DESC");
        expect(String(query.mock.calls[0]?.[0])).not.toContain("LIMIT");
    });
});
