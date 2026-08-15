import { describe, expect, it } from "vitest";

import { canvasThemes } from "@/lib/canvas-theme";
import type { Asset } from "@/lib/library-asset-contract";
import { CanvasNodeType, type CanvasNodeData } from "../types";
import { libraryAssetToInsertPayload } from "./canvas-asset-insert";
import { canvasProjectMenuItemStyle, collectCanvasPanelMedia } from "./canvas-assets-panel";

describe("Canvas assets panel", () => {
    it("keeps only displayable image and video nodes in canvas order", () => {
        const nodes: CanvasNodeData[] = [
            node("image", CanvasNodeType.Image, "/api/reference-assets/image.webp"),
            node("text", CanvasNodeType.Text, "说明文字"),
            node("video", CanvasNodeType.Video, "/api/reference-assets/video.mp4"),
            node("empty", CanvasNodeType.Panorama),
        ];

        expect(collectCanvasPanelMedia(nodes)).toEqual([
            { id: "image", title: "image", kind: "image", url: "/api/reference-assets/image.webp" },
            { id: "video", title: "video", kind: "video", url: "/api/reference-assets/video.mp4" },
        ]);
    });

    it("maps each library asset kind to the stable canvas insertion contract", () => {
        expect(libraryAssetToInsertPayload(asset("text"))).toEqual({ kind: "text", title: "text", content: "提示词" });
        expect(libraryAssetToInsertPayload(asset("image"))).toMatchObject({ kind: "image", title: "image", dataUrl: "/image.webp", storageKey: "image-key" });
        expect(libraryAssetToInsertPayload(asset("video"))).toMatchObject({ kind: "video", title: "video", url: "/video.mp4", width: 1280, height: 720 });
        expect(libraryAssetToInsertPayload(asset("audio"))).toMatchObject({ kind: "audio", title: "audio", url: "/audio.mp3", durationMs: 3000 });
    });

    it("keeps canvas dropdown items transparent until pointer or keyboard focus moves onto them", () => {
        expect(canvasProjectMenuItemStyle(canvasThemes.light)).toEqual({ background: "transparent", color: canvasThemes.light.node.text });
        expect(canvasProjectMenuItemStyle(canvasThemes.dark)).toEqual({ background: "transparent", color: canvasThemes.dark.node.text });
    });
});

function node(id: string, type: CanvasNodeType, content?: string): CanvasNodeData {
    return { id, type, title: id, position: { x: 0, y: 0 }, width: 100, height: 100, metadata: content ? { content } : undefined };
}

function asset(kind: Asset["kind"]): Asset {
    const base = { id: kind, kind, title: kind, coverUrl: "", tags: [], createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z" };
    if (kind === "text") return { ...base, kind, data: { content: "提示词" } };
    if (kind === "image") return { ...base, kind, data: { dataUrl: "/image.webp", storageKey: "image-key", width: 1280, height: 720, bytes: 1, mimeType: "image/webp" } };
    if (kind === "video") return { ...base, kind, data: { url: "/video.mp4", storageKey: "video-key", width: 1280, height: 720, bytes: 1, mimeType: "video/mp4" } };
    return { ...base, kind, data: { url: "/audio.mp3", storageKey: "audio-key", durationMs: 3000, bytes: 1, mimeType: "audio/mpeg" } };
}
