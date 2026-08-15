import { afterEach, describe, expect, it, vi } from "vitest";

import { listAdminAccountDeletionRequests, submitOwnAccountDeletionRequest } from "./account-deletion";

describe("account deletion API client", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("submits the password only to the user endpoint", async () => {
        const fetchMock = vi.fn().mockResolvedValue(Response.json({ code: 0, data: { id: "one", status: "pending" }, msg: "OK" }));
        vi.stubGlobal("fetch", fetchMock);

        await submitOwnAccountDeletionRequest({ currentPassword: "secret", note: "reason" });

        expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/account-deletion");
        expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ currentPassword: "secret", note: "reason" }) });
    });

    it("serializes administrator list filters", async () => {
        const fetchMock = vi.fn().mockResolvedValue(Response.json({ code: 0, data: { items: [], total: 0, page: 1, pageSize: 20 }, msg: "OK" }));
        vi.stubGlobal("fetch", fetchMock);

        await listAdminAccountDeletionRequests({ page: 1, keyword: "creator", status: "pending" });

        expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/account-deletion-requests?page=1&keyword=creator&status=pending");
    });
});
