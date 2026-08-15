import { describe, expect, it } from "vitest";

import { CanvasNodeType } from "@/app/(user)/canvas/types";
import type { CanvasProject } from "@/lib/canvas-project-contract";

import { summarizeCanvasProject } from "./create-workbench-overview";

describe("create workbench overview", () => {
    it("summarizes counts and prioritizes stable successful image previews", () => {
        const project = canvasProject([
            { id: "video", type: CanvasNodeType.Video, metadata: { status: "success", serverUrl: "/video.mp4" } },
            { id: "broken", type: CanvasNodeType.Image, metadata: { status: "error", serverUrl: "/broken.png" } },
            { id: "panorama", type: CanvasNodeType.Panorama, metadata: { status: "success", serverUrl: "/panorama.jpg", remoteUrl: "https://example.com/panorama.jpg" } },
        ]);

        expect(summarizeCanvasProject(project)).toMatchObject({
            nodeCount: 3,
            connectionCount: 1,
            previews: [
                { kind: "image", url: "/panorama.jpg" },
                { kind: "image", url: "https://example.com/panorama.jpg" },
                { kind: "video", url: "/video.mp4" },
            ],
        });
    });

    it("drops temporary and duplicate preview URLs", () => {
        const project = canvasProject([
            { id: "one", type: CanvasNodeType.Image, metadata: { status: "success", serverUrl: "/generated/image.png", content: "data:image/png;base64,abc" } },
            { id: "two", type: CanvasNodeType.Image, metadata: { serverUrl: "/generated/image.png", remoteUrl: "blob:preview" } },
        ]);

        expect(summarizeCanvasProject(project).previews).toEqual([{ kind: "image", url: "/generated/image.png" }]);
    });
});

function canvasProject(nodes: Array<Pick<CanvasProject["nodes"][number], "id" | "type" | "metadata">>): CanvasProject {
    return {
        id: "project",
        title: "项目",
        createdAt: "2026-07-22T00:00:00.000Z",
        updatedAt: "2026-07-22T00:00:00.000Z",
        nodes: nodes.map((node) => ({ ...node, title: "", position: { x: 0, y: 0 }, width: 100, height: 100 })),
        connections: [{ id: "edge" }] as CanvasProject["connections"],
    } as CanvasProject;
}
