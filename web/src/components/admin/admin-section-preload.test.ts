import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin section preload", () => {
    it("warms only the intended section before changing views", async () => {
        const [dashboard, navigation, elements] = await Promise.all([
            readFile(resolve(process.cwd(), "src/components/admin/admin-dashboard.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/components/admin/admin-section-nav.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/components/admin/admin-dashboard-elements.tsx"), "utf8"),
        ]);

        expect(dashboard).toContain("sectionLoaders");
        expect(dashboard).not.toContain("Object.values(sectionLoaders)");
        expect(dashboard).not.toContain("window.requestIdleCallback");
        expect(dashboard).toContain("onIntent={(section) => void sectionLoaders[section]?.()}");
        expect(navigation).toContain("onPointerEnter={() => onIntent?.(section.key)}");
        expect(navigation).toContain("onPointerDown={() => onIntent?.(section.key)}");
        expect(navigation).toContain("onFocus={() => onIntent?.(section.key)}");
        expect(elements).not.toContain("BillingOperations");
        expect(elements).not.toContain("GenerationOperationsClient");
        expect(elements).not.toContain("AdminLocalMediaStorage");
    });
});
