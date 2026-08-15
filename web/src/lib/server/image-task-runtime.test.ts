import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    runCustom: vi.fn(),
    pollCustom: vi.fn(),
    runGemini: vi.fn(),
    runOpenAi: vi.fn(),
    pollOpenAi: vi.fn(),
    getTask: vi.fn(),
    updateTask: vi.fn(),
    transitionTask: vi.fn(),
    schedule: vi.fn(),
    writeLog: vi.fn(),
    inlineResult: vi.fn(),
    directResult: vi.fn(),
    resolveMedia: vi.fn(() => ({})),
    mediaHeaders: vi.fn(() => ({ "x-media-auth": "signed" })),
    getSettings: vi.fn(),
    register: vi.fn(),
    refund: vi.fn(),
    QueryContractError: class extends Error {},
}));

vi.mock("@/app/api/image-tasks/image-task-custom", () => ({ runCustomImageTask: mocks.runCustom, pollCustomImageTask: mocks.pollCustom }));
vi.mock("@/app/api/image-tasks/image-task-gemini", () => ({ runGeminiImageTask: mocks.runGemini }));
vi.mock("@/app/api/image-tasks/image-task-openai", () => ({ runOpenAiImageTask: mocks.runOpenAi }));
vi.mock("@/app/api/image-tasks/image-task-support", () => ({
    directRemoteImageResult: mocks.directResult,
    imageUnits: vi.fn(() => 1),
    ImageQueryContractError: mocks.QueryContractError,
    ImageUpstreamTerminalError: class extends Error {},
    inlineRemoteImageResult: mocks.inlineResult,
    pollOpenAiImageTask: mocks.pollOpenAi,
    resolveProxiedMediaSource: mocks.resolveMedia,
}));
vi.mock("@/app/api/image-tasks/image-task-runner", () => ({ stableMediaUrl: vi.fn((value: string) => (value && !value.startsWith("data:") ? value : "")), writeImageGenerationLog: mocks.writeLog }));
vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.getSettings, refundUserPoints: mocks.refund }));
vi.mock("@/lib/server/creative-runtime-service", () => ({ registerGenerationTaskAssetsForUser: mocks.register }));
vi.mock("@/lib/server/generation-task-scheduler", () => ({ scheduleGenerationTask: mocks.schedule }));
vi.mock("@/lib/server/image-task-store", () => ({
    getImageTask: mocks.getTask,
    updateImageTask: mocks.updateTask,
    transitionImageTask: mocks.transitionTask,
}));
vi.mock("@/lib/server/maintenance-auth", () => ({ maintenanceWorkerContext: vi.fn(() => "worker-context") }));
vi.mock("@/lib/server/generation-media-authorization", () => ({ generationMediaProxyHeaders: mocks.mediaHeaders }));

import { GenerationSubmissionSafeFailure, GenerationSubmissionUncertainError } from "./generation-submission-error";
import { emptyAdvancedConfig } from "@/lib/channel-protocol-registry";
import { createImageTaskUpstreamStep, persistImageTaskResult } from "./image-task-runtime";
import type { ImageTask } from "./image-task-store";

describe("image task runtime submission safety", () => {
    let state: ImageTask;

    beforeEach(() => {
        vi.clearAllMocks();
        state = imageTask();
        mocks.getTask.mockImplementation(async () => state);
        mocks.updateTask.mockImplementation(async (_id: string, patch: Partial<ImageTask>) => {
            state = { ...state, ...patch };
            return state;
        });
        mocks.transitionTask.mockImplementation(async (_task: ImageTask, allowed: string[], patch: Partial<ImageTask>) => {
            if (!allowed.includes(state.status)) return null;
            state = { ...state, ...patch };
            return state;
        });
        mocks.getSettings.mockResolvedValue({ generationPointMultipliers: { imageQuality: {} } });
        mocks.inlineResult.mockImplementation(async (dataUrl: string) => ({ dataUrl }));
        mocks.register.mockResolvedValue(undefined);
    });

    it("switches candidates only after an explicit safe rejection", async () => {
        mocks.runCustom.mockRejectedValueOnce(new GenerationSubmissionSafeFailure("参数不受支持", 422));
        mocks.runGemini.mockResolvedValueOnce({ dataUrl: "", pending: { id: "upstream-two", mediaBaseUrl: "https://two.example", pollBaseUrl: "https://two.example" } });

        await expect(createImageTaskUpstreamStep(state, "http://internal", "https://public.example")).resolves.toMatchObject({
            state: "pending",
            upstream: { id: "upstream-two" },
        });
        expect(mocks.runCustom).toHaveBeenCalledTimes(1);
        expect(mocks.runGemini).toHaveBeenCalledTimes(1);
        expect(state.config.channelId).toBe("channel-two");
        expect(state.candidateConfigs).toEqual([]);
        expect(state.attempts?.map(({ status }) => status)).toEqual(["failed", "running"]);
        expect(mocks.schedule).toHaveBeenLastCalledWith("image", "image-one", expect.objectContaining({ executionPhase: "submitted", upstreamTaskId: "upstream-two", channelId: "channel-two", provider: "gemini", lastUpstreamStatus: "submitted" }));
    });

    it("routes Yumeng image tasks through the declarative async runtime", async () => {
        state.config = { ...state.config, advancedConfig: { ...state.config.advancedConfig!, protocol: "yumeng", createPath: "/kyyReactApiServer/v2/model-center/tasks", queryPath: "/kyyReactApiServer/v2/model-center/tasks/:task_id" } };
        state.candidateConfigs = [];
        mocks.runCustom.mockResolvedValueOnce({ dataUrl: "", pending: { id: "yumeng-task", mediaBaseUrl: "https://zcbservice.aizfw.cn/kyyReactApiServer", pollBaseUrl: "https://zcbservice.aizfw.cn/kyyReactApiServer" } });

        await expect(createImageTaskUpstreamStep(state, "http://internal", "https://public.example")).resolves.toMatchObject({ state: "pending", upstream: { id: "yumeng-task" } });
        expect(mocks.runCustom).toHaveBeenCalledOnce();
        expect(mocks.runOpenAi).not.toHaveBeenCalled();
        expect(mocks.runGemini).not.toHaveBeenCalled();
    });

    it("does not switch candidates when the submission outcome is unknown", async () => {
        mocks.runCustom.mockRejectedValueOnce(new Error("socket closed"));

        await expect(createImageTaskUpstreamStep(state, "http://internal", "https://public.example")).rejects.toBeInstanceOf(GenerationSubmissionUncertainError);
        expect(mocks.runGemini).not.toHaveBeenCalled();
        expect(state.config.channelId).toBe("channel-one");
        expect(state.candidateConfigs).toHaveLength(1);
        expect(state.attempts?.map(({ status }) => status)).toEqual(["running"]);
    });

    it("keeps an OpenAI id-only response for manual review without trying another channel", async () => {
        state.config = { ...state.config, advancedConfig: { ...emptyAdvancedConfig(), protocol: "openai" } };
        mocks.runOpenAi.mockResolvedValueOnce({
            dataUrl: "",
            needsReview: {
                upstream: { id: "upstream-one", mediaBaseUrl: "http://internal", pollBaseUrl: "http://internal" },
                reason: "OpenAI 图片接口未返回图片，且渠道没有声明异步查询路径",
            },
            pointsCost: 1,
            pointsRecordId: "record-one",
        });

        await expect(createImageTaskUpstreamStep(state, "http://internal", "https://public.example")).resolves.toMatchObject({ state: "needs_review", status: "query_contract_missing" });
        expect(mocks.runGemini).not.toHaveBeenCalled();
        expect(state.upstream?.id).toBe("upstream-one");
        expect(state.billing).toMatchObject({ pointsRecordId: "record-one", refunded: false });
        expect(mocks.schedule).toHaveBeenLastCalledWith(
            "image",
            "image-one",
            expect.objectContaining({
                executionPhase: "needs_review",
                upstreamTaskId: "upstream-one",
                channelId: "channel-one",
                nextPollAt: undefined,
                resultPayload: { reviewReason: "OpenAI 图片接口未返回图片，且渠道没有声明异步查询路径" },
            }),
        );
        expect(mocks.refund).not.toHaveBeenCalled();
    });

    it("fails and refunds a corrupt synchronous image result without manual review", async () => {
        state = imageTask();
        state.config = { ...state.config, advancedConfig: { ...emptyAdvancedConfig(), protocol: "openai" } };
        state.candidateConfigs = [];
        mocks.runOpenAi.mockResolvedValueOnce({ dataUrl: "data:image/png;base64,broken", pointsCost: 1, pointsRecordId: "record-one" });
        mocks.writeLog.mockRejectedValueOnce(new Error("pngload_buffer: libspng read error"));

        const step = await createImageTaskUpstreamStep(state, "http://internal", "https://public.example");
        expect(step).toMatchObject({ state: "result_ready", resultUrl: "inline://image-task-result" });
        expect(mocks.schedule).toHaveBeenLastCalledWith("image", "image-one", expect.objectContaining({ executionPhase: "result_ready", resultPayload: { url: "inline://image-task-result" }, lastUpstreamStatus: "completed" }));
        if (step.state !== "result_ready") throw new Error("image result was not ready");
        await expect(persistImageTaskResult(state, "http://internal", step.resultUrl)).rejects.toThrow("pngload_buffer");
        expect(mocks.refund).not.toHaveBeenCalled();
        expect(state.status).toBe("running");
    });

    it("downloads system-proxied image results with task-bound media authorization", async () => {
        state.config = { ...state.config, baseUrl: "/api/ai/system/channel-one", advancedConfig: { ...emptyAdvancedConfig(), protocol: "openai" } };
        state.candidateConfigs = [];
        const remoteUrl = "https://provider.example/media/result.png";
        const proxyUrl = `/api/ai/system/channel-one/_media?url=${encodeURIComponent(remoteUrl)}`;
        mocks.resolveMedia.mockReturnValueOnce({ remoteUrl, proxyUrl });
        mocks.runOpenAi.mockResolvedValueOnce({ dataUrl: proxyUrl, remoteUrl });
        mocks.inlineResult.mockResolvedValueOnce({ dataUrl: "data:image/png;base64,c2FmZQ==", remoteUrl });
        mocks.writeLog.mockResolvedValueOnce({ asset: { url: "/api/generation-log-assets/asset-one", remoteUrl } });

        const step = await createImageTaskUpstreamStep(state, "http://internal", "https://public.example");
        if (step.state !== "result_ready") throw new Error("image result was not ready");
        await expect(persistImageTaskResult(state, "http://internal", step.resultUrl)).resolves.toMatchObject({ status: "success" });

        expect(mocks.mediaHeaders).toHaveBeenCalledWith({ userId: "user-one", taskType: "image", taskId: "image-one", channelId: "channel-one", upstreamModel: "image-one", url: remoteUrl });
        expect(mocks.inlineResult).toHaveBeenCalledWith(proxyUrl, "http://internal", "worker-context", remoteUrl, { "x-media-auth": "signed" });
        expect(mocks.directResult).not.toHaveBeenCalled();
    });

    it("persists and registers every image returned by one upstream task", async () => {
        state.config = { ...state.config, advancedConfig: { ...emptyAdvancedConfig(), protocol: "openai" } };
        state.candidateConfigs = [];
        mocks.runOpenAi.mockResolvedValueOnce({
            dataUrl: "https://provider.example/first.png",
            remoteUrl: "https://provider.example/first.png",
            results: [
                { dataUrl: "https://provider.example/first.png", remoteUrl: "https://provider.example/first.png" },
                { dataUrl: "https://provider.example/second.png", remoteUrl: "https://provider.example/second.png" },
            ],
        });
        mocks.directResult.mockImplementation((url?: string) => (url ? { dataUrl: url, remoteUrl: url } : null));
        mocks.writeLog.mockResolvedValueOnce({
            assets: [
                { type: "image", url: "/api/generation-log-assets/first.png", serverUrl: "/api/generation-log-assets/first.png" },
                { type: "image", url: "/api/generation-log-assets/second.png", serverUrl: "/api/generation-log-assets/second.png" },
            ],
        });

        const step = await createImageTaskUpstreamStep(state, "http://internal", "https://public.example");
        if (step.state !== "result_ready") throw new Error("image result was not ready");
        await persistImageTaskResult(state, "http://internal", step.resultUrl);

        expect(state.result?.results?.map((item) => item.serverUrl)).toEqual(["/api/generation-log-assets/first.png", "/api/generation-log-assets/second.png"]);
        expect(mocks.register).toHaveBeenCalledWith(
            "user-one",
            expect.objectContaining({
                assets: [
                    { type: "image", url: "/api/generation-log-assets/first.png" },
                    { type: "image", url: "/api/generation-log-assets/second.png" },
                ],
            }),
        );
    });
});

function imageTask(): ImageTask {
    const second = { baseUrl: "https://two.example", apiKey: "two", apiFormat: "gemini" as const, model: "image-two", channelId: "channel-two" };
    return {
        id: "image-one",
        userId: "user-one",
        username: "user",
        displayName: "User",
        kind: "generation",
        source: "image-workbench",
        status: "pending",
        createdAt: 1,
        updatedAt: 1,
        config: {
            baseUrl: "https://one.example",
            apiKey: "one",
            apiFormat: "openai",
            model: "image-one",
            channelId: "channel-one",
            advancedConfig: { ...emptyAdvancedConfig(), protocol: "custom", createPath: "/images", requestTemplate: "{}", resultField: "url" },
        },
        candidateConfigs: [second],
        prompt: "test",
        references: [],
    };
}
