import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), listAdminGenerationOperations: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/generation-operations-service", () => ({ listAdminGenerationOperations: mocks.listAdminGenerationOperations }));

import { GET } from "./route";

describe("GET /api/admin/generation-operations", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", status: "active", adminPermissions: ["generation.read"] });
        mocks.listAdminGenerationOperations.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, summary: {}, channels: [] });
    });

    it("requires admin role", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "user", role: "user" });
        expect((await GET(new Request("http://localhost/api/admin/generation-operations"))).status).toBe(403);
    });

    it("passes bounded query filters to the aggregation service", async () => {
        const response = await GET(new Request("http://localhost/api/admin/generation-operations?page=2&type=video&surface=drama&search=project"));

        expect(response.status).toBe(200);
        expect(mocks.listAdminGenerationOperations).toHaveBeenCalledWith(expect.objectContaining({ page: 2, type: "video", surface: "drama", search: "project" }));
    });
});
