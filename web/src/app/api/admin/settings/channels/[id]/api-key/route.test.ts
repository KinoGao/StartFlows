import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getAuthSettings: vi.fn(),
    safeRecordAuditLog: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.getAuthSettings, isAuthInputError: vi.fn(() => false) }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin" })), safeRecordAuditLog: mocks.safeRecordAuditLog }));

import { POST } from "./route";

const savedChannel = { id: "saved", name: "已保存", apiKey: "test-secret-value" };

describe("admin channel API key route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", status: "active", adminPermissions: ["upstream.manage"] });
        mocks.getAuthSettings.mockResolvedValue({ systemChannels: [savedChannel] });
    });

    it("reveals one saved key only to an admin and disables response caching", async () => {
        const response = await POST(request(), context("saved"));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ apiKey: "test-secret-value" });
        expect(response.headers.get("cache-control")).toContain("no-store");
        expect(mocks.safeRecordAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "admin.settings.channel_api_key.view",
                target: { type: "system-model-channel", id: "saved", label: "已保存" },
            }),
        );
    });

    it("rejects unauthenticated and non-admin users", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "user", role: "user" });

        expect((await POST(request(), context("saved"))).status).toBe(401);
        expect((await POST(request(), context("saved"))).status).toBe(403);
        expect(mocks.getAuthSettings).not.toHaveBeenCalled();
    });

    it("does not expose unrelated settings when the channel or key is missing", async () => {
        expect((await POST(request(), context("missing"))).status).toBe(404);

        mocks.getAuthSettings.mockResolvedValueOnce({ systemChannels: [{ ...savedChannel, apiKey: "" }] });
        const response = await POST(request(), context("saved"));
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "该渠道尚未保存可用的 API Key" });
        expect(mocks.safeRecordAuditLog).not.toHaveBeenCalled();
    });

    it("does not reveal an encrypted storage value", async () => {
        mocks.getAuthSettings.mockResolvedValueOnce({ systemChannels: [{ ...savedChannel, apiKey: "vozeb-pro-secret:v1:iv.tag.payload" }] });

        const response = await POST(request(), context("saved"));

        expect(response.status).toBe(404);
        expect(JSON.stringify(await response.json())).not.toContain("vozeb-pro-secret:v1:");
        expect(mocks.safeRecordAuditLog).not.toHaveBeenCalled();
    });
});

function request() {
    return new Request("http://localhost/api/admin/settings/channels/saved/api-key", { method: "POST" });
}

function context(id: string) {
    return { params: Promise.resolve({ id }) };
}
