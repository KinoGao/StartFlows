import { describe, expect, it, vi } from "vitest";

import { moderateWorkContent } from "./work-content-moderation";

const input = { title: "公开作品", description: "作品说明", category: "插画", tags: ["原创"] };
const now = () => new Date("2026-07-27T00:00:00.000Z");

describe("work content moderation", () => {
    it("keeps manual review as the default without auto approving", async () => {
        await expect(moderateWorkContent(input, { env: {}, now })).resolves.toEqual({
            provider: "manual",
            signal: { riskLevel: "review", labels: [], summary: "等待人工审核。", checkedAt: "2026-07-27T00:00:00.000Z" },
        });
    });

    it("returns a review signal when configured keywords match", async () => {
        const result = await moderateWorkContent({ ...input, description: "包含风险词" }, { env: { VOZEB_PRO_CONTENT_MODERATION_PROVIDER: "keywords", VOZEB_PRO_CONTENT_MODERATION_KEYWORDS: "风险词,另一个词" }, now });

        expect(result.provider).toBe("keywords");
        expect(result.signal).toMatchObject({ riskLevel: "review", labels: ["keyword:风险词"] });
    });

    it("checks the explicitly public prompt", async () => {
        const result = await moderateWorkContent({ ...input, publicPrompt: "公开风险词" }, { env: { VOZEB_PRO_CONTENT_MODERATION_PROVIDER: "keywords", VOZEB_PRO_CONTENT_MODERATION_KEYWORDS: "风险词" }, now });

        expect(result.signal).toMatchObject({ riskLevel: "review", labels: ["keyword:风险词"] });
    });

    it("falls back to manual review when an external provider fails", async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
        const result = await moderateWorkContent(input, { env: { VOZEB_PRO_CONTENT_MODERATION_PROVIDER: "http", VOZEB_PRO_CONTENT_MODERATION_URL: "https://moderation.example.com/check" }, fetchImpl, now });

        expect(result).toMatchObject({ provider: "manual", signal: { riskLevel: "review", labels: ["provider_unavailable"] } });
    });
});
