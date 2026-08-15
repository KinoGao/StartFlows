import { describe, expect, it } from "vitest";

import { isCanvasAgentNearLatest } from "./use-canvas-agent-message-scroll";

describe("Canvas Agent message scrolling", () => {
    it("follows content when the user remains near the latest message", () => {
        expect(isCanvasAgentNearLatest({ scrollHeight: 1200, scrollTop: 620, clientHeight: 500 })).toBe(true);
    });

    it("stops following after the user scrolls into older messages", () => {
        expect(isCanvasAgentNearLatest({ scrollHeight: 1200, scrollTop: 300, clientHeight: 500 })).toBe(false);
    });
});
