import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { isFullscreenWorkspacePath } from "./app-workspace-path";

describe("workspace sidebar", () => {
    it("starts expanded and keeps scrolling without a visible scrollbar", async () => {
        const [shell, sidebar] = await Promise.all([readFile(resolve(process.cwd(), "src/components/layout/app-workspace-shell.tsx"), "utf8"), readFile(resolve(process.cwd(), "src/components/layout/app-sidebar.tsx"), "utf8")]);

        expect(shell).toContain("const [sidebarExpanded, setSidebarExpanded] = useState(true)");
        expect(shell).toContain("expanded={sidebarExpanded}");
        expect(sidebar).toContain('expanded ? "w-44" : "w-[72px]"');
        expect(sidebar).toContain("hide-scrollbar min-h-0 flex-1 overflow-y-auto");
        expect(sidebar).not.toContain("thin-scrollbar min-h-0 flex-1 overflow-y-auto");
        expect(sidebar).toContain('<CircleHelp className="size-[18px] shrink-0" />');
        expect(sidebar).not.toContain("userAvatarFallback");
        expect(sidebar).not.toContain("workspaceUrl");
        expect(sidebar).not.toContain("window.location.host");
    });

    it("opens Canvas and drama project details as full-screen workspaces only", () => {
        expect(isFullscreenWorkspacePath("/canvas/canvas-one")).toBe(true);
        expect(isFullscreenWorkspacePath("/canvas/canvas-one/history")).toBe(true);
        expect(isFullscreenWorkspacePath("/drama/drama-one")).toBe(true);
        expect(isFullscreenWorkspacePath("/drama/drama-one/episode")).toBe(true);
        expect(isFullscreenWorkspacePath("/canvas")).toBe(false);
        expect(isFullscreenWorkspacePath("/drama")).toBe(false);
    });
});
