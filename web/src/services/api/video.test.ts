import { afterEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

const mocks = vi.hoisted(() => ({ imageToDataUrl: vi.fn() }));

vi.mock("@/services/api/points", () => ({ refreshUserPointsIfSystem: vi.fn(async () => undefined), syncUserPointsFromHeaders: vi.fn() }));
vi.mock("@/services/file-storage", () => ({ getMediaBlob: vi.fn(), uploadMediaFile: vi.fn() }));
vi.mock("@/services/image-storage", () => ({ imageToDataUrl: mocks.imageToDataUrl }));
vi.mock("@/stores/use-config-store", () => ({
    buildApiUrl: vi.fn((baseUrl: string, path: string) => `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`),
    resolveModelRequestConfig: vi.fn((config: Record<string, unknown>, model: string) => ({ ...config, model, apiSource: "system" })),
    modelOptionName: vi.fn((model: string) => model),
}));

import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import { cancelServerVideoGenerationTask, createServerVideoGenerationTask, createVideoGenerationTask, pollVideoGenerationTask } from "./video";
import { createUpstreamVideoGenerationTask } from "./video-core";
import { buildCompatibleVideoPayloadVariants, compatibleVideoCreatePaths, compatibleVideoPollPaths, isGlobalAiOpcVideoConfig } from "./video-providers";
import { normalizeCompatibleVideoDuration, normalizeGlobalAiOpcVideoDuration } from "./video-payloads";
import { normalizeVideoSeconds } from "./video-support";
import { GLOBAL_AIOPC_VIDEO_CREATE_PATH } from "./video-types";

const config = {
    model: "video-v1",
    videoModel: "video-v1",
    size: "16:9",
    vquality: "720",
    videoSeconds: "5",
    videoGenerateAudio: "false",
    videoWatermark: "false",
} as AiConfig;

describe("video API service", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it("submits the original public image source instead of the local asset preview", async () => {
        const fetchMock = vi.fn().mockResolvedValue(json({ task: { id: "video-task-1", model: "video-v1" } }));
        vi.stubGlobal("fetch", fetchMock);
        const reference = {
            id: "reference-1",
            name: "人物参考",
            type: "image/png",
            dataUrl: "blob:local-preview",
            storageKey: "image:1",
            url: "https://cdn.example.com/original-person.png",
            remoteUrl: "https://cdn.example.com/original-person.png",
        } as ReferenceImage;

        await createServerVideoGenerationTask(config, "保持人物与场景不变，仅自然眨眼", [reference], [], [], { clientRequestId: "video-workbench:conversation:slot", attemptNo: 2 });

        const init = fetchMock.mock.calls[0][1] as RequestInit;
        const headers = new Headers(init.headers);
        const body = JSON.parse(String(init.body)) as { references: Array<{ type: string; url: string }> };
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe("/api/video-generation-tasks");
        expect(headers.get("x-vozeb-pro-client-request-id")).toBe("video-workbench:conversation:slot");
        expect(headers.get("x-vozeb-pro-attempt-no")).toBe("2");
        expect(body.references).toEqual([{ type: "image", role: "reference", url: "https://cdn.example.com/original-person.png" }]);
        expect(mocks.imageToDataUrl).not.toHaveBeenCalled();
    });

    it("preserves explicit first and last frame roles in the server payload", async () => {
        const fetchMock = vi.fn().mockResolvedValue(json({ task: { id: "video-task-frames", model: "video-v1" } }));
        vi.stubGlobal("fetch", fetchMock);
        const references = [
            { id: "first-image", name: "首帧", type: "image/png", dataUrl: "https://cdn.example.com/first.png", url: "https://cdn.example.com/first.png", videoRole: "first_frame" },
            { id: "last-image", name: "尾帧", type: "image/png", dataUrl: "https://cdn.example.com/last.png", url: "https://cdn.example.com/last.png", videoRole: "last_frame" },
        ] as ReferenceImage[];

        await createServerVideoGenerationTask(config, "让首尾画面自然衔接", references);

        const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
        expect(body.references).toEqual([
            { type: "image", role: "first_frame", url: "https://cdn.example.com/first.png" },
            { type: "image", role: "last_frame", url: "https://cdn.example.com/last.png" },
        ]);
    });

    it("routes the public creation helper through the server task endpoint", async () => {
        const fetchMock = vi.fn().mockResolvedValue(json({ task: { id: "video-task-2", model: "video-v1" } }));
        vi.stubGlobal("fetch", fetchMock);

        const task = await createVideoGenerationTask(config, "生成一段海边日落视频", [], [], [], { clientRequestId: "request-two" });

        expect(task).toMatchObject({ id: "video-task-2", serverTaskId: "video-task-2", pollPath: "server" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe("/api/video-generation-tasks");
    });

    it("returns a terminal failure when the upstream submission needs manual review", async () => {
        const fetchMock = vi.fn().mockResolvedValue(json({ task: { id: "video-review", status: "running", needsReview: true, reviewReason: "视频提交结果无法确认" } }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(pollVideoGenerationTask(config, { id: "video-review", provider: "generation", model: "video-v1", pollPath: "server" })).resolves.toEqual({
            status: "failed",
            error: "视频提交结果无法确认",
            needsReview: true,
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("allows recreation only when the server confirms an upstream failure", async () => {
        const fetchMock = vi.fn().mockResolvedValue(json({ task: { id: "video-failed", status: "error", error: "上游生成失败", canRetry: true } }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(pollVideoGenerationTask(config, { id: "video-failed", provider: "generation", model: "video-v1", pollPath: "server" })).resolves.toEqual({
            status: "failed",
            error: "上游生成失败",
            canRetry: true,
        });
    });

    it("cancels a server-owned video task without accepting a result URL", async () => {
        const fetchMock = vi.fn().mockResolvedValue(json({ task: { id: "video-running", status: "cancelled" } }));
        vi.stubGlobal("fetch", fetchMock);

        await cancelServerVideoGenerationTask({ id: "video-running", provider: "generation", model: "video-v1", pollPath: "server" });

        expect(fetchMock).toHaveBeenCalledWith("/api/video-tasks/video-running", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "cancel" }) }));
    });

    it("reports a cancellation conflict without creating another task", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "当前任务无法取消" }), { status: 409, headers: { "content-type": "application/json" } })));

        await expect(cancelServerVideoGenerationTask({ id: "video-finished", provider: "generation", model: "video-v1", pollPath: "server" })).rejects.toThrow("当前任务无法取消");
    });

    it("recognizes GlobalAiOpc only from an exact provider host", () => {
        expect(isGlobalAiOpcVideoConfig({ ...config, baseUrl: "https://api.globalaiopc.com/v1" }, "other-model")).toBe(true);
        expect(isGlobalAiOpcVideoConfig({ ...config, baseUrl: "https://globalaiopc.com.evil.test/v1" }, "other-model")).toBe(false);
        expect(isGlobalAiOpcVideoConfig({ ...config, baseUrl: "https://kyyreactapiserver-production.example.com/v1" }, "other-model")).toBe(true);
    });

    it("preserves administrator-configured durations until protocol-specific normalization", () => {
        expect(normalizeVideoSeconds("60")).toBe("60");
        expect(normalizeCompatibleVideoDuration("60")).toBe(60);
        expect(normalizeGlobalAiOpcVideoDuration("60")).toBe(60);
        expect(normalizeCompatibleVideoDuration("-1")).toBe(-1);
    });

    it("keeps every explicit reference in compatible video payloads", async () => {
        const images = Array.from({ length: 10 }, (_, index) => ({
            id: `image-${index + 1}`,
            name: `参考图 ${index + 1}`,
            type: "image/png",
            dataUrl: `https://cdn.example.com/image-${index + 1}.png`,
            url: `https://cdn.example.com/image-${index + 1}.png`,
        })) as ReferenceImage[];
        const videos = Array.from({ length: 4 }, (_, index) => ({ id: `video-${index + 1}`, name: `参考视频 ${index + 1}`, type: "video/mp4", url: `https://cdn.example.com/video-${index + 1}.mp4` }));
        const audios = Array.from({ length: 4 }, (_, index) => ({ id: `audio-${index + 1}`, name: `参考音频 ${index + 1}`, type: "audio/mpeg", url: `https://cdn.example.com/audio-${index + 1}.mp3` }));

        const payloads = await buildCompatibleVideoPayloadVariants({ ...config, baseUrl: "https://api.globalaiopc.com/v1" } as AiConfig, config.model, "生成视频", images, GLOBAL_AIOPC_VIDEO_CREATE_PATH, videos, audios);
        const serialized = JSON.stringify(payloads);

        expect(serialized).toContain("image-10.png");
        expect(serialized).toContain("video-4.mp4");
        expect(serialized).toContain("audio-4.mp3");
    });

    it("uses only the Yumeng v2 paths and request template", async () => {
        const yumeng = {
            ...config,
            baseUrl: "/api/ai/system/yumeng",
            apiKey: "system",
            model: "seedance-2.5",
            videoModel: "seedance-2.5",
            videoSeconds: "60",
            advancedConfig: {
                protocol: "yumeng",
                createPath: "/kyyReactApiServer/v2/model-center/tasks",
                queryPath: "/kyyReactApiServer/v2/model-center/tasks/:task_id",
                referenceRule: "参考素材必须使用公网 URL",
                requestTemplate:
                    '{"model":"{{model}}","prompt":"{{prompt}}","reference_images":"{{images}}","reference_videos":"{{videos}}","reference_audios":"{{audios}}","duration":"{{duration}}","aspect_ratio":"{{aspect_ratio}}","resolution":"{{resolution}}","first_image":"{{first_frame}}","last_image":"{{last_frame}}"}',
            },
        } as AiConfig;
        const imageReference = { id: "image-one", name: "参考图片", type: "image/png", dataUrl: "https://cdn.example.com/reference.png", url: "https://cdn.example.com/reference.png" } as ReferenceImage;
        const videoReference = { id: "video-one", name: "参考视频", type: "video/mp4", url: "https://cdn.example.com/reference.mp4" };
        const audioReference = { id: "audio-one", name: "参考音频", type: "audio/mpeg", url: "https://cdn.example.com/reference.mp3" };

        expect(compatibleVideoCreatePaths(yumeng, yumeng.model)).toEqual(["/kyyReactApiServer/v2/model-center/tasks"]);
        expect(compatibleVideoPollPaths(yumeng, { id: "task-one", model: yumeng.model } as never)).toEqual(["/kyyReactApiServer/v2/model-center/tasks/:task_id"]);
        await expect(buildCompatibleVideoPayloadVariants(yumeng, yumeng.model, "生成视频", [imageReference], "/kyyReactApiServer/v2/model-center/tasks", [videoReference], [audioReference])).resolves.toEqual([
            expect.objectContaining({
                model: "seedance-2.5",
                prompt: "生成视频",
                duration: 15,
                aspect_ratio: "16:9",
                reference_images: ["https://cdn.example.com/reference.png"],
                reference_videos: ["https://cdn.example.com/reference.mp4"],
                reference_audios: ["https://cdn.example.com/reference.mp3"],
            }),
        ]);
    });

    it("submits reference video to the documented Yumeng v2 API", async () => {
        const yumeng = {
            ...config,
            baseUrl: "/api/ai/system/yumeng",
            apiKey: "system",
            model: "seedance-2.5",
            videoModel: "seedance-2.5",
            advancedConfig: {
                protocol: "yumeng",
                createPath: "/kyyReactApiServer/v2/model-center/tasks",
                queryPath: "/kyyReactApiServer/v2/model-center/tasks/:task_id",
                requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}","reference_videos":"{{videos}}"}',
            },
        } as AiConfig;
        const post = vi.spyOn(axios, "post").mockResolvedValue({ data: { id: "yumeng-task", status: "queued" }, headers: {} });
        const reference = { id: "video-one", name: "参考视频", type: "video/mp4", url: "https://cdn.example.com/reference.mp4" };

        await expect(createUpstreamVideoGenerationTask(yumeng, "生成视频", [], [reference])).resolves.toMatchObject({ id: "yumeng-task" });
        expect(post.mock.calls[0][1]).toMatchObject({ reference_videos: ["https://cdn.example.com/reference.mp4"] });
    });
});

function json(value: unknown) {
    return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}
