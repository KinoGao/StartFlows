import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), checkRateLimit: vi.fn(), rateLimitHeaders: vi.fn(), createUserDataExportStream: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/security", () => ({ checkRateLimit: mocks.checkRateLimit, rateLimitHeaders: mocks.rateLimitHeaders }));
vi.mock("@/lib/server/user-data-export-service", () => ({ createUserDataExportStream: mocks.createUserDataExportStream }));

import { GET } from "./route";

describe("GET /api/auth/data-export", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 2, resetAt: Date.now() + 1000 });
        mocks.rateLimitHeaders.mockReturnValue({ "Retry-After": "60" });
        mocks.createUserDataExportStream.mockResolvedValue(new ReadableStream({ start: (controller) => controller.close() }));
    });

    it("requires an authenticated user", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);

        const response = await GET();

        expect(response.status).toBe(401);
        expect(mocks.createUserDataExportStream).not.toHaveBeenCalled();
    });

    it("returns a private JSON download for the current user", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one", role: "user" });

        const response = await GET();

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("application/json");
        expect(response.headers.get("content-disposition")).toContain("vozeb-pro-personal-data-");
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(mocks.createUserDataExportStream).toHaveBeenCalledWith("user-one");
    });

    it("limits repeated exports", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one", role: "user" });
        mocks.checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });

        const response = await GET();

        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("60");
        expect(mocks.createUserDataExportStream).not.toHaveBeenCalled();
    });

    it("does not expose internal errors", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one", role: "user" });
        mocks.createUserDataExportStream.mockRejectedValue(new Error("database password leaked"));
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        const response = await GET();

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "个人数据导出失败，请稍后重试" });
    });
});
