import { describe, expect, it } from "vitest";

import { mergeTaskReferences, requestedTextLimit, taskImageUrls, taskResultItems, textConstraintInstruction } from "./agent-run-execution-helpers";

describe("text output constraints", () => {
    it("forwards the user requested character limit without adding a platform retry or truncation policy", () => {
        const prompt = "请写一段不超过20字的介绍";

        expect(requestedTextLimit(prompt)).toBe(20);
        expect(textConstraintInstruction(prompt, "text")).toContain("最终结果不得超过 20 个 Unicode 字符");
    });
});

describe("mergeTaskReferences", () => {
    it("keeps an explicit frame role when dependency references use the same media URL", () => {
        expect(
            mergeTaskReferences(
                [{ assetId: "first-image", type: "image", url: "/api/reference-assets/first.png", role: "first_frame" }],
                [{ assetId: "dependency-image", sourceTaskId: "image-task", type: "image", url: "/api/reference-assets/first.png", role: "reference" }],
            ),
        ).toEqual([{ assetId: "first-image", sourceTaskId: "image-task", type: "image", url: "/api/reference-assets/first.png", role: "first_frame" }]);
    });

    it("promotes a dependency frame role when the existing reference is ordinary", () => {
        expect(
            mergeTaskReferences(
                [{ assetId: "ordinary", type: "image", url: "/api/reference-assets/last.png", role: "reference" }],
                [{ assetId: "last-image", sourceTaskId: "image-task", type: "image", url: "/api/reference-assets/last.png", role: "last_frame" }],
            ),
        ).toEqual([{ assetId: "ordinary", sourceTaskId: "image-task", type: "image", url: "/api/reference-assets/last.png", role: "last_frame" }]);
    });

    it("keeps all distinct dependency references", () => {
        const references = Array.from({ length: 25 }, (_, index) => ({ assetId: `asset-${index}`, type: "image" as const, url: `/api/reference-assets/${index}.png` }));

        expect(mergeTaskReferences([], references)).toEqual(references);
    });

    it("keeps all result records and image URLs", () => {
        const results = Array.from({ length: 12 }, (_, index) => ({ url: `/api/generation-log-assets/${index}.png` }));

        expect(taskResultItems({ results })).toEqual(results);
        expect(taskImageUrls({ results })).toEqual(results.map((item) => item.url));
    });
});
