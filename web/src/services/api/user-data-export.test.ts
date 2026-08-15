import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadUserDataExport, userDataExportFileName } from "./user-data-export";

describe("user data export API", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("uses and sanitizes the download filename", () => {
        expect(userDataExportFileName('attachment; filename="vozeb-pro:data.json"')).toBe("vozeb-pro-data.json");
        expect(userDataExportFileName("attachment; filename*=UTF-8''%E6%88%91%E7%9A%84%E6%95%B0%E6%8D%AE.json")).toBe("我的数据.json");
    });

    it("downloads the current user's export", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { headers: { "content-disposition": 'attachment; filename="personal.json"' } })));

        const result = await downloadUserDataExport();

        expect(result.fileName).toBe("personal.json");
        expect(await result.blob.text()).toBe("{}");
        expect(fetch).toHaveBeenCalledWith("/api/auth/data-export", { cache: "no-store" });
    });
});
