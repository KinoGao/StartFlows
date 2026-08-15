import { describe, expect, it } from "vitest";

import { formatCreativeMessageTime } from "./creative-result-presentation";

describe("creative result presentation", () => {
    it("formats current-day message timestamps without hard-coded values", () => {
        const now = new Date();
        now.setHours(10, 23, 0, 0);
        expect(formatCreativeMessageTime(now.getTime())).toMatch(/^今天 10:23$/);
    });

    it("rejects invalid timestamps", () => {
        expect(formatCreativeMessageTime(Number.NaN)).toBe("");
    });
});
