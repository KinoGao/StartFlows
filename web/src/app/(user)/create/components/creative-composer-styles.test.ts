import { describe, expect, it } from "vitest";

import { creativeComposerToolButtonClass } from "@/components/creative-composer-styles";

describe("creativeComposerToolButtonClass", () => {
    it("only keeps the active palette while its popover is open", () => {
        const closedClass = creativeComposerToolButtonClass(false);
        const openClass = creativeComposerToolButtonClass(true);

        expect(closedClass).toContain("!bg-white");
        expect(closedClass).not.toContain("!bg-[#eef2f4]");
        expect(closedClass).toContain("focus:!bg-white");
        expect(closedClass).toContain("active:!bg-white");
        expect(openClass).toContain("!bg-[#eef2f4]");
        expect(openClass).toContain("focus:!bg-[#eef2f4]");
        expect(openClass).toContain("active:!bg-[#eef2f4]");
    });
});
