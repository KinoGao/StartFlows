import { describe, expect, it } from "vitest";

import { classifyManagedMediaType, mediaSourceGroup, mediaTaskSource } from "./media-management-contract";

describe("media management contract", () => {
    it("classifies common media and otherwise treats files as attachments", () => {
        expect(classifyManagedMediaType({ name: "poster.webp" })).toBe("image");
        expect(classifyManagedMediaType({ mimeType: "audio/mpeg", name: "voice.bin" })).toBe("audio");
        expect(classifyManagedMediaType({ name: "project.zip" })).toBe("attachment");
    });

    it("groups raw storage sources into stable administrator entry filters", () => {
        expect(mediaSourceGroup("image-task-reference")).toBe("image-workbench");
        expect(mediaSourceGroup("video-task")).toBe("video-workbench");
        expect(mediaSourceGroup("drama-render")).toBe("drama");
        expect(mediaSourceGroup("creative-upload")).toBe("upload");
        expect(mediaSourceGroup("audio-task")).toBe("other");
    });

    it("resolves task media sources from explicit entry or runtime context", () => {
        expect(mediaTaskSource("video-workbench", { surface: "chat" }, "video-task")).toBe("video-workbench");
        expect(mediaTaskSource(undefined, { surface: "drama" }, "video-task")).toBe("drama");
        expect(mediaTaskSource(undefined, { surface: "chat", clientRequestId: "video-workbench:one" }, "video-task")).toBe("video-workbench");
        expect(mediaTaskSource(undefined, { surface: "chat" }, "video-task")).toBe("agent");
    });
});
