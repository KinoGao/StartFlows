import { beforeEach, describe, expect, it, vi } from "vitest";

import { refreshUserPointsIfSystem } from "@/services/api/points";
import { optimizePrompt } from "./prompt-optimization";

vi.mock("@/services/api/points", () => ({ refreshUserPointsIfSystem: vi.fn(async () => undefined) }));
vi.mock("@/services/api/session-expiration", () => ({ throwIfClientSessionExpired: vi.fn() }));

describe("prompt optimization API client", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn());
        vi.mocked(refreshUserPointsIfSystem).mockClear();
    });

    it("returns the optimized prompt and refreshes billed points", async () => {
        vi.mocked(fetch).mockResolvedValue(Response.json({ code: 0, data: { prompt: "优化后的提示词" }, msg: "OK" }));

        await expect(optimizePrompt({ requestId: "request-one", prompt: "原文", mode: "video" })).resolves.toBe("优化后的提示词");
        expect(fetch).toHaveBeenCalledWith("/api/agent/prompt-optimization", expect.objectContaining({ method: "POST", body: JSON.stringify({ requestId: "request-one", prompt: "原文", mode: "video" }) }));
        expect(refreshUserPointsIfSystem).toHaveBeenCalledWith("system");
    });

    it("surfaces the server message", async () => {
        vi.mocked(fetch).mockResolvedValue(Response.json({ code: 503, data: null, msg: "后台尚未配置可用的默认文本模型" }, { status: 503 }));

        await expect(optimizePrompt({ requestId: "request-one", prompt: "原文", mode: "agent" })).rejects.toThrow("后台尚未配置可用的默认文本模型");
        expect(refreshUserPointsIfSystem).toHaveBeenCalledWith("system");
    });
});
