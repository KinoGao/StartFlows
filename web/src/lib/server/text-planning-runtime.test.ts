import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SystemChannelAdvancedConfig, SystemModelChannel } from "@/lib/auth/store";
import { fetchInternalApi } from "@/lib/server/internal-origin";
import { getTextPlanningRuntime, rankTextPlanningCandidates, requestStructuredText, resetTextPlanningRuntime, type TextPlanningCandidate } from "./text-planning-runtime";

vi.mock("@/lib/server/internal-origin", () => ({ fetchInternalApi: vi.fn() }));
vi.mock("@/lib/server/channel-runtime-health", () => ({ recordChannelRuntimeFailure: vi.fn(), recordChannelRuntimeSuccess: vi.fn() }));

const mockedFetch = vi.mocked(fetchInternalApi);
const tool = { name: "make_plan", description: "创建计划", parameters: { type: "object", properties: { result: { type: "string" } } } };

describe("text planning runtime protocol matrix", () => {
    beforeEach(() => {
        resetTextPlanningRuntime();
        mockedFetch.mockReset();
        vi.useRealTimers();
    });

    it.each(["openai", "sub2api", "newapi"] as const)("%s 严格预设直接使用基础 Chat", async (protocol) => {
        mockedFetch.mockResolvedValue(chatJsonResponse());

        const result = await requestStructuredText(requestInput(candidate(protocol, { createPath: "/responses" })));

        expect(result).toMatchObject({ protocol: "chat", arguments: "{}" });
        expect(mockedFetch).toHaveBeenCalledTimes(1);
        expect(String(mockedFetch.mock.calls[0]?.[0])).toContain("/chat/completions");
        expectBasicJsonMessages(requestBody());
    });

    it("compatible 模型明确配置 Responses 时直接使用 Responses", async () => {
        mockedFetch.mockResolvedValue(Response.json({ output_text: "{}" }));

        const result = await requestStructuredText(requestInput(candidate("compatible", { createPath: "/responses" })));

        expect(result).toMatchObject({ protocol: "responses", arguments: "{}" });
        expect(mockedFetch).toHaveBeenCalledTimes(1);
        expect(String(mockedFetch.mock.calls[0]?.[0])).toContain("/responses");
        expect(requestBody()).toMatchObject({ model: "model-one", input: expect.any(Array) });
        expect(requestBody()).not.toHaveProperty("tools");
        expect(requestBody()).not.toHaveProperty("reasoning");
    });

    it("模型级 Responses 预设覆盖 New API 渠道的默认 Chat", async () => {
        const configured = candidate("newapi", {
            modelConfigs: {
                "model-one": { capability: "text", protocol: "compatible", createPath: "/responses" },
            },
        });
        mockedFetch.mockResolvedValue(Response.json({ output_text: "{}" }));

        const result = await requestStructuredText(requestInput(configured));

        expect(result.protocol).toBe("responses");
        expect(String(mockedFetch.mock.calls[0]?.[0])).toContain("/responses");
    });

    it("模型级自定义协议不会因路径名为 responses 被误判", async () => {
        const configured = candidate("compatible", {
            modelConfigs: {
                "model-one": { capability: "text", protocol: "custom", createPath: "/responses", requestTemplate: '{"deployment":"{{model}}","prompt":"{{prompt}}"}', resultField: "payload.plan" },
            },
        });
        mockedFetch.mockResolvedValue(Response.json({ payload: { plan: "{}" } }));

        const result = await requestStructuredText(requestInput(configured));

        expect(result.protocol).toBe("custom");
        expect(requestBody()).toMatchObject({ deployment: "model-one", prompt: expect.stringContaining("user: test") });
    });

    it("GlobalAiOpc Responses 预设直接使用 Responses", async () => {
        mockedFetch.mockResolvedValue(Response.json({ output: [{ type: "function_call", name: "make_plan", arguments: "{}" }] }));

        const result = await requestStructuredText(requestInput(candidate("globalaiopc", { globalAiOpcPreset: "text-openai-responses" })));

        expect(result.protocol).toBe("responses");
        expect(String(mockedFetch.mock.calls[0]?.[0])).toContain("/responses");
    });

    it.each(["text-gemini-native", "text-claude-native"] as const)("GlobalAiOpc %s 通过系统代理的 Chat 适配调用", async (globalAiOpcPreset) => {
        mockedFetch.mockResolvedValue(chatJsonResponse());

        const result = await requestStructuredText(requestInput(candidate("globalaiopc", { globalAiOpcPreset })));

        expect(result.protocol).toBe("chat");
        expect(String(mockedFetch.mock.calls[0]?.[0])).toContain("/chat/completions");
        expectBasicJsonMessages(requestBody());
    });

    it("Gemini 原生预设使用 generateContent 并解析候选文本", async () => {
        mockedFetch.mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }));

        const result = await requestStructuredText(
            requestInput(
                candidate("compatible", {
                    apiFormat: "gemini",
                    createPath: "/models/:model:generateContent",
                }),
            ),
        );

        expect(result).toMatchObject({ protocol: "gemini", arguments: "{}" });
        expect(String(mockedFetch.mock.calls[0]?.[0])).toContain("/models/model-one:generateContent");
        expect(requestBody()).toMatchObject({ contents: [{ role: "user", parts: [{ text: "test" }] }], systemInstruction: { parts: [{ text: expect.stringContaining("严格 JSON") }] } });
    });

    it("自定义文本协议使用管理员模板、路径和结果字段", async () => {
        mockedFetch.mockResolvedValue(Response.json({ data: { plan: "{}" } }));

        const result = await requestStructuredText(
            requestInput(
                candidate("custom", {
                    createPath: "/planner/run",
                    requestTemplate: '{"deployment":"{{model}}","conversation":"{{messages}}"}',
                    resultField: "data.plan",
                }),
            ),
        );

        expect(result).toMatchObject({ protocol: "custom", arguments: "{}" });
        expect(String(mockedFetch.mock.calls[0]?.[0])).toContain("/planner/run");
        expect(requestBody()).toMatchObject({ deployment: "model-one", conversation: expect.arrayContaining([{ role: "user", content: "test" }]) });
    });

    it("只为上游协议作用域追加后缀，不改写服务端计费身份", async () => {
        mockedFetch.mockResolvedValue(chatJsonResponse());

        await requestStructuredText({
            ...requestInput(candidate("newapi")),
            headers: { "x-vozeb-pro-points-idempotency-key": "planning-one", "idempotency-key": "planning-one" },
        });

        const headers = new Headers(mockedFetch.mock.calls[0]?.[1]?.headers);
        expect(headers.get("x-vozeb-pro-points-idempotency-key")).toBe("planning-one");
        expect(headers.get("idempotency-key")).toBe("planning-one:chat-json");
    });

    it("上游返回 422 时不会在同一候选内自动重复请求", async () => {
        mockedFetch.mockResolvedValueOnce(new Response("/backend-api/conversation failed: status=422, body=", { status: 422 }));

        await expect(requestStructuredText(requestInput(candidate("newapi")))).rejects.toMatchObject({ status: 422 });
        expect(mockedFetch).toHaveBeenCalledTimes(1);
    });

    it("同一渠道不同模型的协议预设互不污染", async () => {
        const channel = candidate("compatible", {
            modelConfigs: {
                "model-one": { capability: "text", protocol: "compatible", createPath: "/responses" },
                "model-two": { capability: "text", protocol: "compatible", createPath: "/chat/completions" },
            },
        }).channel;
        mockedFetch.mockResolvedValueOnce(Response.json({ output_text: "{}" })).mockResolvedValueOnce(chatJsonResponse());

        const first = await requestStructuredText(requestInput({ channelId: channel.id, upstreamModel: "model-one", channel }));
        const second = await requestStructuredText(requestInput({ channelId: channel.id, upstreamModel: "model-two", channel }));

        expect([first.protocol, second.protocol]).toEqual(["responses", "chat"]);
        expect(mockedFetch.mock.calls.map(([url]) => String(url))).toEqual([expect.stringContaining("/responses"), expect.stringContaining("/chat/completions")]);
    });

    it("优先排列近期成功且延迟更低的候选", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const slow = candidate("newapi", { id: "slow" });
        const fast = candidate("newapi", { id: "fast" });
        mockedFetch.mockImplementationOnce(async () => {
            vi.advanceTimersByTime(900);
            return chatJsonResponse();
        });
        await requestStructuredText(requestInput(slow));
        mockedFetch.mockImplementationOnce(async () => {
            vi.advanceTimersByTime(80);
            return chatJsonResponse();
        });
        await requestStructuredText(requestInput(fast));

        expect(rankTextPlanningCandidates([slow, fast])).toEqual([fast, slow]);
    });

    it("失败候选进入短期冷却并排在健康候选之后", async () => {
        const failed = candidate("newapi", { id: "failed" });
        const healthy = candidate("newapi", { id: "healthy" });
        mockedFetch.mockRejectedValueOnce(new Error("connection refused"));
        await expect(requestStructuredText(requestInput(failed))).rejects.toThrow("暂时无法连接");
        mockedFetch.mockResolvedValueOnce(chatJsonResponse());
        await requestStructuredText(requestInput(healthy));

        expect(rankTextPlanningCandidates([failed, healthy])).toEqual([healthy, failed]);
        expect(getTextPlanningRuntime(failed)?.cooldownUntil).toBeGreaterThan(Date.now());
    });

    it("不会把 HTML 网关错误原文返回给用户", async () => {
        mockedFetch.mockResolvedValue(new Response("<!doctype html><title>Bad gateway</title><body>nginx secret trace</body>", { status: 502 }));

        await expect(requestStructuredText(requestInput(candidate("newapi")))).rejects.toThrow("文本模型渠道暂不可用（HTTP 502）");
    });

    it("把超时转换为可读且可切换渠道的错误", async () => {
        mockedFetch.mockRejectedValue(Object.assign(new Error("timed out"), { name: "TimeoutError" }));

        await expect(requestStructuredText(requestInput(candidate("newapi")))).rejects.toThrow("文本模型规划响应超时");
    });

    it("所有文本规划候选都使用三分钟超时", async () => {
        const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
        mockedFetch.mockResolvedValueOnce(chatJsonResponse()).mockResolvedValueOnce(chatJsonResponse());

        await requestStructuredText(requestInput(candidate("newapi")));
        await requestStructuredText(requestInput({ ...candidate("newapi", { id: "long-reasoning" }), capabilityProfile: { timeoutMs: 8 * 60_000 } }));

        expect(timeoutSpy).toHaveBeenNthCalledWith(1, 3 * 60_000);
        expect(timeoutSpy).toHaveBeenNthCalledWith(2, 3 * 60_000);
    });
});

function requestInput(configured: TextPlanningCandidate) {
    return {
        origin: "http://127.0.0.1:3000",
        cookie: "session=test",
        candidate: configured,
        messages: [{ role: "user", content: "test" }],
        tool,
    };
}

function candidate(protocol: NonNullable<SystemChannelAdvancedConfig>["protocol"], options: Partial<SystemChannelAdvancedConfig> & { id?: string; apiFormat?: "openai" | "gemini" } = {}): TextPlanningCandidate {
    const id = options.id || `${protocol}-channel`;
    const advancedConfig = {
        protocol,
        textModel: "model-one",
        imageModel: "",
        videoModel: "",
        createPath: "",
        queryPath: "",
        requestTemplate: "",
        resultField: "",
        statusField: "",
        durationRange: "",
        referenceRule: "",
        supportsReferenceImage: false,
        supportsReferenceVideo: false,
        supportsReferenceAudio: false,
        ...options,
    } satisfies SystemChannelAdvancedConfig;
    const channel = {
        id,
        name: id,
        baseUrl: "https://example.com/v1",
        apiKey: "secret",
        apiFormat: options.apiFormat || "openai",
        models: ["model-one", "model-two"],
        enabled: true,
        advancedConfig,
    } satisfies SystemModelChannel;
    return { channelId: id, upstreamModel: "model-one", channel };
}

function requestBody() {
    return JSON.parse(String(mockedFetch.mock.calls.at(-1)?.[1]?.body)) as Record<string, unknown>;
}

function expectBasicJsonMessages(body: Record<string, unknown>) {
    expect(body).toMatchObject({ model: "model-one", messages: expect.arrayContaining([{ role: "user", content: "test" }]) });
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("tool_choice");
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body).not.toHaveProperty("max_completion_tokens");
}

function chatJsonResponse() {
    return Response.json({ choices: [{ message: { content: "{}" } }] });
}
