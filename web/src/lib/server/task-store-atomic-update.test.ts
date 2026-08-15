import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("./generation-task-store", () => ({
    countActiveStoredGenerationTasks: vi.fn(),
    createStoredGenerationTask: vi.fn(),
    getStoredGenerationTask: vi.fn(),
    mutateStoredGenerationTask: mocks.mutate,
    touchStoredGenerationTask: vi.fn(),
    transitionStoredGenerationTask: vi.fn(),
}));

import { updateAudioTask } from "./audio-task-store";
import { updateImageTask } from "./image-task-store";
import { updateTextTask } from "./text-task-store";

describe("generation task metadata updates", () => {
    beforeEach(() => {
        mocks.mutate.mockReset();
        mocks.mutate.mockImplementation(async (_type: string, _id: string, _ttl: number, mutate: (current: Record<string, unknown>) => unknown) => mutate({ id: "task", status: "cancelled", attempts: [], createdAt: 1, updatedAt: 1 }));
    });

    it("uses an atomic mutation for image, text and audio metadata", async () => {
        await updateImageTask("image-task", { attemptNo: 2 });
        await updateTextTask("text-task", { attemptNo: 2 });
        await updateAudioTask("audio-task", { attemptNo: 2 });

        expect(mocks.mutate).toHaveBeenCalledTimes(3);
        expect(mocks.mutate.mock.calls.map(([type]) => type)).toEqual(["image", "text", "audio"]);
        for (const call of mocks.mutate.mock.calls) {
            const result = await call[3]({ id: "task", status: "cancelled", attempts: [], createdAt: 1, updatedAt: 1 });
            expect(result).toMatchObject({ status: "cancelled", attemptNo: 2 });
        }
    });
});
