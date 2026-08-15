import { afterEach, describe, expect, it, vi } from "vitest";

import { listUserLoginEvents } from "./login-security";

describe("login security API", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("requests a paginated user-scoped login history", async () => {
        const fetchMock = vi.fn().mockResolvedValue(Response.json({ items: [{ id: "login-one", createdAt: "2026-08-09T10:00:00.000Z" }], total: 1, page: 1, pageSize: 8 }));
        vi.stubGlobal("fetch", fetchMock);

        const result = await listUserLoginEvents({ page: 1, pageSize: 8 });

        expect(result.total).toBe(1);
        expect(fetchMock).toHaveBeenCalledWith("/api/auth/login-events?page=1&pageSize=8", { cache: "no-store" });
    });
});
