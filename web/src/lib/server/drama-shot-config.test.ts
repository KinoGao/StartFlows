import { describe, expect, it } from "vitest";

import { resolveDramaShotDuration } from "./drama-shot-config";

describe("resolveDramaShotDuration", () => {
    it("uses the backend video duration when the model omits it", () => {
        expect(resolveDramaShotDuration(undefined, 10)).toBe(10);
    });

    it("keeps an explicit model duration", () => {
        expect(resolveDramaShotDuration(6, 10)).toBe(6);
    });

    it("keeps durations above the former platform ceiling", () => {
        expect(resolveDramaShotDuration(60, 10)).toBe(60);
        expect(resolveDramaShotDuration(0, 30)).toBe(30);
    });
});
