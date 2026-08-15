import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    updateUserByAdmin: vi.fn(),
    deleteAdminUserWithMediaCleanup: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({
    updateUserByAdmin: mocks.updateUserByAdmin,
    isAuthInputError: vi.fn(() => false),
}));
vi.mock("@/lib/server/admin-user-deletion-service", () => ({ deleteAdminUserWithMediaCleanup: mocks.deleteAdminUserWithMediaCleanup }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: vi.fn() }));

import { DELETE, PATCH } from "./route";

describe("admin user detail route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["users.manage", "administrators.manage", "billing.manage"] });
        mocks.updateUserByAdmin.mockResolvedValue({ id: "user-one", username: "creator", role: "user", status: "active" });
        mocks.deleteAdminUserWithMediaCleanup.mockResolvedValue({ ok: true });
    });

    it("updates user fields with the current administrator permission", async () => {
        const response = await PATCH(request("PATCH", { role: "admin" }), context());

        expect(response.status).toBe(200);
        expect(mocks.updateUserByAdmin).toHaveBeenCalledWith("admin-one", "user-one", { role: "admin" });
    });

    it("deletes the user aggregate with the current administrator permission", async () => {
        const response = await DELETE(request("DELETE"), context());

        expect(response.status).toBe(200);
        expect(mocks.deleteAdminUserWithMediaCleanup).toHaveBeenCalledWith("admin-one", "user-one");
    });
});

function request(method: string, body?: unknown) {
    return new Request("http://localhost/api/admin/users/user-one", {
        method,
        ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
}

function context() {
    return { params: Promise.resolve({ id: "user-one" }) };
}
