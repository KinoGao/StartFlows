import { describe, expect, it } from "vitest";

import { creativeComposerPopoverOverflow, creativeComposerPopoverPanelMaxHeight, resolveCreativeComposerPopoverPlacement } from "@/components/creative-composer-popover";

describe("creative composer popover positioning", () => {
    it("keeps desktop direction fixed without automatic flipping", () => {
        expect(resolveCreativeComposerPopoverPlacement("bottomLeft", false)).toBe("bottomLeft");
        expect(creativeComposerPopoverOverflow("bottomLeft")).toBe(false);
    });

    it("centers narrow popovers and only shifts them horizontally", () => {
        expect(resolveCreativeComposerPopoverPlacement("bottomLeft", true)).toBe("bottom");
        expect(resolveCreativeComposerPopoverPlacement("topLeft", true)).toBe("top");
        expect(resolveCreativeComposerPopoverPlacement("topRight", true)).toBe("top");
        expect(resolveCreativeComposerPopoverPlacement("bottomRight", true)).toBe("bottom");
        expect(creativeComposerPopoverOverflow("bottom")).toEqual({ adjustX: 1, adjustY: 0 });
    });

    it("limits a panel to the actual space beside its trigger", () => {
        expect(creativeComposerPopoverPanelMaxHeight("bottom", { top: 280, bottom: 320 }, { top: 0, bottom: 844 }, 520)).toBe(500);
        expect(creativeComposerPopoverPanelMaxHeight("top", { top: 280, bottom: 320 }, { top: 20, bottom: 844 }, 520)).toBe(236);
    });
});
