import { describe, expect, it } from "vitest";

import { sanitizePortableData } from "./user-data-export-policy";

describe("sanitizePortableData", () => {
    it("removes embedded media, signed links, secrets, and internal planning fields", () => {
        const result = sanitizePortableData({
            title: "用户作品",
            serverUrl: "/api/reference-assets/user/file.png",
            dataUrl: "data:image/png;base64,AAAA",
            remoteUrl: "https://provider.example/result.png",
            previewUrl: "https://bucket.example/file.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=secret",
            apiKey: "secret",
            nested: {
                foundation: { brief: { objective: "内部规划" } },
                deliverables: [{ prompt: "内部模型提示词" }],
                resolvedPrompt: "内部改写提示词",
                prompt: "用户保存的提示词",
                metadata: { prompt: "旧数据里的内部执行提示词", source: "canvas" },
            },
        });

        expect(result).toEqual({
            title: "用户作品",
            serverUrl: "/api/reference-assets/user/file.png",
            nested: { prompt: "用户保存的提示词", metadata: { source: "canvas" } },
        });
    });

    it("keeps ordinary external links that are not temporary signed URLs", () => {
        expect(sanitizePortableData({ sourceUrl: "https://example.com/reference.jpg?size=large" })).toEqual({ sourceUrl: "https://example.com/reference.jpg?size=large" });
    });
});
