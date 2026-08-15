import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), preview: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/server/object-storage-service", () => ({ createExternalStorageImagePreviewUrl: mocks.preview }));

import { GET } from "./route";

describe("administrator object storage image preview API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.user.mockResolvedValue({ id: "admin", role: "admin", status: "active", adminPermissions: ["system.manage"] });
        mocks.preview.mockResolvedValue("https://oss.example.com/preview.webp?signature=test");
    });

    it("requires an administrator", async () => {
        mocks.user.mockResolvedValueOnce(null);
        expect((await GET(new Request("http://localhost/api/admin/object-storage/files/preview?key=vozeb-pro/file.png"))).status).toBe(401);
        mocks.user.mockResolvedValueOnce({ id: "user", role: "user" });
        expect((await GET(new Request("http://localhost/api/admin/object-storage/files/preview?key=vozeb-pro/file.png"))).status).toBe(403);
        expect(mocks.preview).not.toHaveBeenCalled();
    });

    it("redirects an authorized request to the WebP object variant", async () => {
        const response = await GET(new Request("http://localhost/api/admin/object-storage/files/preview?key=vozeb-pro/file.png&width=640"));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("https://oss.example.com/preview.webp?signature=test");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(mocks.preview).toHaveBeenCalledWith("vozeb-pro/file.png", "640");
    });

    it("does not expose invalid or non-image objects", async () => {
        mocks.preview.mockResolvedValueOnce(null);
        const response = await GET(new Request("http://localhost/api/admin/object-storage/files/preview?key=vozeb-pro/file.zip"));
        expect(response.status).toBe(404);
    });
});
