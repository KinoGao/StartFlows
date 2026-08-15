import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CreativeAsset, CreativeMessage } from "@/lib/creative-runtime-contract";

import { CreativeMediaResult } from "./creative-media-result";
import { CreativeVideoResult } from "./creative-video-result";

describe("creative generation results", () => {
    it("renders a single portrait image shrink-to-fit without a switcher", () => {
        const markup = renderToStaticMarkup(<CreativeMediaResult assets={[asset("image-one", "image", 720, 1280)]} renderActions={(active) => <div data-active={active.id} />} />);

        expect(markup).toContain('data-results-count="1"');
        expect(markup).toContain('data-rendered-width="300"');
        expect(markup).toContain('data-rendered-height="533"');
        expect(markup).toContain('data-active="image-one"');
        expect(markup).toContain("col-start-1 row-start-2");
        expect(markup).not.toContain("更多生成结果");
        expect(markup).not.toContain("max-w-[612px]");
        expect(markup).not.toContain("min-h-[300px]");
    });

    it("renders the shared switcher for multiple real image assets", () => {
        const markup = renderToStaticMarkup(<CreativeMediaResult assets={[asset("image-one", "image", 1024, 1024), asset("image-two", "image", 1920, 1080)]} />);

        expect(markup).toContain('data-results-count="2"');
        expect(markup).toContain("更多生成结果");
        expect(markup).toContain('aria-label="查看生成结果 2"');
    });

    it("counts only successful image assets when deciding whether to render more results", () => {
        const failed = { ...asset("image-failed", "image", 1024, 1024), status: "failed" as const };
        const markup = renderToStaticMarkup(<CreativeMediaResult assets={[asset("image-ready", "image", 1024, 1024), failed]} />);

        expect(markup).toContain('data-results-count="1"');
        expect(markup).not.toContain("更多生成结果");
    });

    it("renders a single square video with no highlights, storyboard or switcher", () => {
        const markup = renderToStaticMarkup(<CreativeVideoResult assets={[asset("video-one", "video", 1024, 1024)]} message={message()} />);

        expect(markup).toContain('data-results-count="1"');
        expect(markup).toContain('data-rendered-width="420"');
        expect(markup).toContain('data-rendered-height="420"');
        expect(markup).not.toContain("更多生成结果");
        expect(markup).not.toContain("视频亮点");
        expect(markup).not.toContain("镜头分镜");
    });

    it("uses the same switcher for multiple real video assets", () => {
        const markup = renderToStaticMarkup(<CreativeVideoResult assets={[asset("video-one", "video", 1920, 1080), asset("video-two", "video", 720, 1280)]} message={message()} />);

        expect(markup).toContain('data-results-count="2"');
        expect(markup).toContain("更多生成结果");
        expect(markup).toContain('aria-label="查看生成结果 2"');
        expect((markup.match(/preload="metadata"/g) || []).length).toBe(1);
    });

    it("counts only successful video assets when deciding whether to render more results", () => {
        const failed = { ...asset("video-failed", "video", 1920, 1080), status: "failed" as const };
        const markup = renderToStaticMarkup(<CreativeVideoResult assets={[asset("video-ready", "video", 1920, 1080), failed]} message={message()} />);

        expect(markup).toContain('data-results-count="1"');
        expect(markup).not.toContain("更多生成结果");
    });

    it("keeps the React-managed video source during Strict Mode effect cleanup", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/create/components/creative-video-result.tsx"), "utf8");
        const effectStart = source.indexOf("useEffect(() =>", source.indexOf("function useVideoPlayback"));
        const cleanup = source.slice(effectStart, source.indexOf("const togglePlayback", effectStart));

        expect(cleanup).toContain("video?.pause()");
        expect(cleanup).not.toContain('removeAttribute("src")');
        expect(cleanup).not.toContain("video.load()");
    });
});

function asset(id: string, type: "image" | "video", width: number, height: number): CreativeAsset {
    return {
        id,
        userId: "user",
        conversationId: "conversation",
        messageId: "assistant",
        sourceRunId: "run",
        ordinal: 0,
        type,
        status: "ready",
        title: id,
        serverUrl: `/${id}.${type === "video" ? "mp4" : "png"}`,
        width,
        height,
        durationMs: type === "video" ? 10_000 : undefined,
        metadata: {},
        createdAt: 1,
        updatedAt: 1,
    };
}

function message(): CreativeMessage {
    return { id: "assistant", conversationId: "conversation", runId: "run", sequence: 2, role: "assistant", status: "completed", content: "完成", metadata: {}, createdAt: 1, updatedAt: 1 };
}
