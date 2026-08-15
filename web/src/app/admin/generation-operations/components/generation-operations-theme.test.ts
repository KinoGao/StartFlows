import { describe, expect, it } from "vitest";

import { generationOperationStatusTagClass, generationOperationThemeClasses } from "./generation-operations-theme";

describe("generation operations theme", () => {
    it("uses explicit readable light and dark states for tags and review controls", () => {
        for (const className of Object.values(generationOperationThemeClasses)) {
            expect(className).toContain("dark:");
        }
        expect(generationOperationThemeClasses.selectedAction).toContain("bg-sky-50");
        expect(generationOperationThemeClasses.selectedAction).toContain("dark:bg-sky-950/45");
        expect(generationOperationStatusTagClass("running")).toContain("!bg-amber-50");
        expect(generationOperationStatusTagClass("running")).toContain("dark:!bg-amber-950/35");
        expect(generationOperationStatusTagClass("success")).toContain("dark:!text-zinc-100");
        expect(generationOperationStatusTagClass("error")).toContain("dark:!text-red-200");
        expect(generationOperationStatusTagClass("cancelled")).toBe(generationOperationThemeClasses.neutralTag);
    });
});
