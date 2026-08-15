import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioTask } from "./audio-task-store";

const mocks = vi.hoisted(() => ({
    refundUserPoints: vi.fn(),
    getAudioTask: vi.fn(),
    transitionAudioTask: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({ refundUserPoints: mocks.refundUserPoints }));
vi.mock("@/lib/server/audio-task-store", () => ({ getAudioTask: mocks.getAudioTask, transitionAudioTask: mocks.transitionAudioTask }));
vi.mock("@/lib/server/generation-channel", () => ({ generationModelId: vi.fn(() => "voice") }));

import { refundAudioTask } from "./audio-task-refund";

const task = {
    id: "audio-one",
    userId: "user",
    status: "error",
    createdAt: 1,
    updatedAt: 1,
    config: { baseUrl: "https://api.example.com/v1", apiKey: "secret", apiFormat: "openai", model: "voice" },
    prompt: "test",
    billing: { pointsCost: 8, pointsRecordId: "points-audio-one", refunded: false },
} satisfies AudioTask;

describe("audio task refunds", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.refundUserPoints.mockResolvedValue({ pointsBalance: 100 });
        mocks.transitionAudioTask.mockImplementation(async (_task, _statuses, patch) => ({ ...task, ...patch }));
        mocks.getAudioTask.mockResolvedValue({ ...task, billing: { ...task.billing, refunded: true } });
    });

    it("marks the task refunded only after the idempotent points refund succeeds", async () => {
        const result = await refundAudioTask(task);

        expect(mocks.refundUserPoints).toHaveBeenCalledWith("user", "voice", 8, "audio", 1, "audio-task:audio-one:refund", "points-audio-one");
        expect(mocks.refundUserPoints.mock.invocationCallOrder[0]).toBeLessThan(mocks.transitionAudioTask.mock.invocationCallOrder[0]);
        expect(result.billing?.refunded).toBe(true);
    });

    it("keeps the task refundable when the points refund fails", async () => {
        mocks.refundUserPoints.mockRejectedValue(new Error("database unavailable"));

        await expect(refundAudioTask(task)).rejects.toThrow("database unavailable");
        expect(mocks.transitionAudioTask).not.toHaveBeenCalled();
    });
});
