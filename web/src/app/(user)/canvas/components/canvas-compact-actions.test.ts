import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

async function componentSource(name: string) {
    return readFile(resolve(process.cwd(), `src/app/(user)/canvas/components/${name}`), "utf8");
}

describe("Canvas compact actions", () => {
    it("keeps result location actions icon-only and aligned beside the result text", async () => {
        const source = await componentSource("canvas-agent-chat-ui.tsx");
        const section = source.slice(source.indexOf("const resultNodeIds"), source.indexOf('objectField(item.detail, "runId")'));

        expect(section).toContain('objectField(item.detail, "taskType") === "text" ? []');
        expect(section).toContain('className="flex min-w-0 items-start gap-1"');
        expect(section).toContain('className="mt-0.5 grid size-7 place-items-center');
        expect(section.indexOf("{item.text}")).toBeLessThan(section.indexOf("{resultNodeIds.map"));
        expect(section).toContain("<Tooltip key={nodeId} title={locateLabel}");
        expect(section).toContain("aria-label={locateLabel}");
        expect(section).not.toMatch(/<Crosshair[^>]*\/>\s*\{locateLabel\}/);
    });

    it("keeps node hover actions icon-only and exposes labels through tooltips", async () => {
        const [toolbarSource, settingsSource] = await Promise.all([componentSource("canvas-node-hover-toolbar.tsx"), componentSource("canvas-image-toolbar-settings-modal.tsx")]);

        expect(toolbarSource).toContain("<Tooltip title={title}");
        expect(toolbarSource).toContain("aria-label={title}");
        expect(toolbarSource).not.toContain("showImageToolLabels");
        expect(settingsSource).not.toContain("显示按钮文字");
        expect(settingsSource).not.toContain("showLabels");
    });
});
