import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    review: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/internal-origin", () => ({ resolveInternalOrigin: vi.fn(() => "http://internal") }));
vi.mock("@/lib/server/generation-task-review-service", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/server/generation-task-review-service")>()),
    reviewGenerationTask: mocks.review,
}));

import { POST } from "./route";

describe("admin generation task review route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("rejects non-admin users", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one", role: "user" });

        const response = await POST(request({ action: "confirm_failed" }), context("image", "task-one"));

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toMatchObject({ code: 403, data: null, msg: "需要管理员权限" });
        expect(mocks.review).not.toHaveBeenCalled();
    });

    it("passes a trusted internal origin when resuming an upstream task", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["generation.manage"] });
        mocks.review.mockResolvedValue({ action: "resume_upstream", executionPhase: "submitted" });

        const response = await POST(request({ action: "resume_upstream", upstreamTaskId: "upstream-one" }), context("video", "task-one"));

        expect(response.status).toBe(200);
        expect(mocks.review).toHaveBeenCalledWith("video", "task-one", {
            action: "resume_upstream",
            upstreamTaskId: "upstream-one",
            origin: "http://internal",
        });
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { executionPhase: "submitted" } });
    });
});

function request(body: unknown) {
    return new Request("https://app.example/api/admin/generation-operations/image/task-one/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

function context(type: string, id: string) {
    return { params: Promise.resolve({ type, id }) };
}
