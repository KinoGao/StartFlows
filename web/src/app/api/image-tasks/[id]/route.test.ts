import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    currentUser: vi.fn(),
    getImageTask: vi.fn(),
    getSchedule: vi.fn(),
    recover: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
    const actual = await importOriginal<typeof import("next/server")>();
    return { ...actual, after: vi.fn() };
});
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/app/api/image-tasks/image-task-reference-urls", () => ({ requestPublicOrigin: vi.fn(() => "https://public.example.com") }));
vi.mock("@/lib/server/image-task-store", () => ({ getImageTask: mocks.getImageTask, transitionImageTask: vi.fn() }));
vi.mock("@/lib/server/generation-task-recovery-service", () => ({ runGenerationTaskRecoveryBatch: mocks.recover }));
vi.mock("@/lib/server/generation-task-store", () => ({ getStoredGenerationTaskRecord: mocks.getSchedule }));
vi.mock("@/lib/server/internal-origin", () => ({ resolveInternalOrigin: vi.fn(() => "http://localhost") }));
vi.mock("@/lib/server/points-response", () => ({ pointsResponseHeaders: vi.fn(() => new Headers()) }));
vi.mock("@/lib/server/generation-channel", () => ({ generationModelId: vi.fn(() => "image-model") }));

import { after } from "next/server";
import { GET } from "./route";

const context = { params: Promise.resolve({ id: "image-one" }) };

describe("GET /api/image-tasks/[id]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.currentUser.mockResolvedValue({ id: "user", role: "user" });
        mocks.getSchedule.mockResolvedValue({ executionPhase: "polling" });
    });

    it("returns the current image state and schedules the same task for recovery", async () => {
        mocks.getImageTask.mockResolvedValue(imageTask());

        const response = await GET(new Request("http://localhost/api/image-tasks/image-one", { headers: { cookie: "session=test" } }), context);

        expect(response.status).toBe(200);
        expect((await response.json()).task).toMatchObject({ id: "image-one", status: "running" });
        expect(after).toHaveBeenCalledOnce();
        const recovery = vi.mocked(after).mock.calls[0]?.[0] as () => Promise<unknown>;
        await recovery();
        expect(mocks.recover).toHaveBeenCalledWith(expect.objectContaining({ taskIds: ["image-one"], origin: "http://localhost", publicOrigin: "https://public.example.com" }));
    });

    it.each(["success", "error", "cancelled"])("does not wake a %s task", async (status) => {
        mocks.getImageTask.mockResolvedValue(imageTask({ status }));
        mocks.getSchedule.mockResolvedValue({ executionPhase: "completed" });

        await GET(new Request("http://localhost/api/image-tasks/image-one"), context);

        expect(after).not.toHaveBeenCalled();
    });

    it("leaves an uncertain submission for manual review", async () => {
        mocks.getImageTask.mockResolvedValue(imageTask({ reviewReason: "图片提交结果无法确认" }));
        mocks.getSchedule.mockResolvedValue({ executionPhase: "needs_review" });

        const response = await GET(new Request("http://localhost/api/image-tasks/image-one"), context);

        expect(after).not.toHaveBeenCalled();
        expect((await response.json()).task).toMatchObject({ needsReview: true, reviewReason: "图片提交结果无法确认" });
    });
});

function imageTask(patch: Record<string, unknown> = {}) {
    return {
        id: "image-one",
        userId: "user",
        kind: "generation",
        status: "running",
        config: { channelId: "channel", baseUrl: "/api/ai/system/channel", apiKey: "system", apiFormat: "openai", model: "image-model" },
        ...patch,
    };
}
