import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGPQq/3/H4QZYAwAWewKpRUlAtEAAAAASUVORK5CYII=";
const FALLBACK_MP4 = Buffer.from("AAAAIGZ0eXBpc29tAAACAGlzb21pc28ybXA0MQ==", "base64");

const models = [
    { id: "mock-text", capability: "text", api_format: "openai", endpoint: "/chat/completions" },
    { id: "mock-image", capability: "image", api_format: "openai", endpoint: "/images/generations" },
    { id: "mock-video", capability: "video", api_format: "openai", endpoint: "/videos" },
    { id: "mock-audio", capability: "audio", api_format: "openai", endpoint: "/audio/speech" },
];

const GLOBAL_AIOPC_IMAGE_PATHS = new Set(["/image2/images", "/banana/images"]);
const YUMENG_MODEL_CENTER_TASK_PATH = "/kyyReactApiServer/v2/model-center/tasks";
const GLOBAL_AIOPC_VIDEO_PATHS = new Set([
    "/sora/videos",
    "/veo/videos",
    "/seedance/videos",
    "/kyyvideo2/videos",
    "/seedance-discount/videos",
    "/seedance-x1/videos",
    "/sd2_manxue/videos",
    "/grok/videos",
    "/omni-flash/videos",
    "/happyhorse-t2v/videos",
    "/happyhorse-i2v/videos",
    "/happyhorse-r2v/videos",
    "/happyhorse-edit/videos",
    "/starvideos/videos",
    "/videos/videos",
    "/luxvid-video/videos",
    "/vidu/videos",
]);

export function createProtocolFixtureServer(options = {}) {
    const tasks = new Map();
    const requests = [];
    let taskSequence = 0;
    const nextTaskId = (kind) => `fixture-${kind}-${++taskSequence}`;
    const server = createServer(async (request, response) => {
        try {
            const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
            const body = await readRequestBody(request);
            requests.push({ method: request.method || "GET", path: url.pathname, headers: request.headers, contentType: request.headers["content-type"] || "", body });
            await handleFixtureRequest({ request, response, url, body, tasks, requests, nextTaskId, options });
        } catch (error) {
            sendJson(response, 500, { error: { message: error instanceof Error ? error.message : "fixture failed" } });
        }
    });
    return { server, requests, tasks };
}

async function handleFixtureRequest({ request, response, url, body, tasks, requests, nextTaskId, options }) {
    const path = fixturePath(url.pathname);
    const responseDelayMs = Math.max(0, Number(options.responseDelayMs) || 0);
    if (request.method === "POST" && responseDelayMs) await delay(responseDelayMs);
    if (request.method === "GET" && path === "/health") return sendJson(response, 200, { ok: true });
    if (request.method === "GET" && path === "/__state") {
        return sendJson(response, 200, {
            requests: requests
                .filter((item) => !item.path.endsWith("/__state"))
                .map((item) => ({
                    method: item.method,
                    path: item.path,
                    authorization: item.headers.authorization || "",
                    contentType: item.contentType,
                    bodyBytes: item.body.byteLength,
                    model: requestedModel(item.body, item.contentType),
                })),
            tasks: Array.from(tasks.entries()).map(([id, task]) => ({ id, ...task })),
        });
    }
    if (request.method === "POST" && path === "/__reset") {
        requests.splice(0, requests.length);
        tasks.clear();
        return sendJson(response, 200, { ok: true });
    }
    if (request.method === "GET" && ["/models", "/api/v3/models"].includes(path)) {
        const catalog = url.searchParams.has("protocol") ? [...models, { id: "opaque-catalog-model" }] : models;
        return sendJson(response, 200, { object: "list", data: catalog });
    }
    if (request.method === "GET" && path === "/sdapi/v1/sd-models") {
        return sendJson(response, 200, [{ title: "mock-image", model_name: "mock-image", id: "mock-image" }, ...(url.searchParams.has("protocol") ? [{ id: "opaque-catalog-model" }] : [])]);
    }

    if (request.method === "POST" && ["/responses", "/chat/completions", "/messages"].includes(path)) {
        const payload = jsonBody(body);
        const model = requestedModel(body, request.headers["content-type"] || "");
        if (shouldFailRequest(request, model)) return sendJson(response, model.includes("-fail") ? 400 : 503, { error: { message: "fixture text failure" } });
        const toolName = selectedToolName(payload);
        const argumentsText = toolName ? JSON.stringify(toolArguments(toolName, payload)) : "协议测试文本返回成功";
        if (path === "/responses") {
            return sendJson(response, 200, toolName ? { output: [{ type: "function_call", name: toolName, arguments: argumentsText }] } : { output_text: argumentsText });
        }
        if (path === "/messages") {
            return sendJson(response, 200, toolName ? { content: [{ type: "tool_use", id: "tool-fixture", name: toolName, input: JSON.parse(argumentsText) }] } : { content: [{ type: "text", text: argumentsText }] });
        }
        return sendJson(response, 200, {
            choices: [
                {
                    message: toolName ? { role: "assistant", content: "", tool_calls: [{ id: "tool-fixture", type: "function", function: { name: toolName, arguments: argumentsText } }] } : { role: "assistant", content: argumentsText },
                },
            ],
            usage: { prompt_tokens: 8, completion_tokens: 8, total_tokens: 16 },
        });
    }

    if (request.method === "POST" && /\/models\/[^/]+:generateContent$/.test(path)) {
        const payload = jsonBody(body);
        if (payload.generationConfig?.responseModalities?.includes("IMAGE")) {
            return sendJson(response, 200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: (await fixtureImage(options)).toString("base64") } }] } }] });
        }
        const toolName = selectedToolName(payload);
        const text = toolName ? JSON.stringify(toolArguments(toolName, payload)) : "协议测试文本返回成功";
        return sendJson(response, 200, { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 8, totalTokenCount: 16 } });
    }
    if (request.method === "POST" && path === "/planner/run") return sendJson(response, 200, { data: { plan: JSON.stringify({}) } });

    const geminiCreate = path.match(/^\/models\/([^/]+):predictLongRunning$/);
    if (request.method === "POST" && geminiCreate) {
        const id = nextTaskId("gemini-operation");
        tasks.set(id, { kind: "gemini-video", status: "completed", model: decodeURIComponent(geminiCreate[1]) });
        return sendJson(response, 200, { name: `models/${decodeURIComponent(geminiCreate[1])}/operations/${id}`, done: false });
    }
    const geminiOperation = path.match(/^\/models\/([^/]+)\/operations\/([^/]+)$/);
    if (request.method === "GET" && geminiOperation) {
        const id = decodeURIComponent(geminiOperation[2]);
        const model = decodeURIComponent(geminiOperation[1]);
        const task = tasks.get(id);
        if (!task || task.kind !== "gemini-video") return sendJson(response, 404, { error: { message: "Gemini operation not found" } });
        return sendJson(response, 200, {
            name: `models/${model}/operations/${id}`,
            done: task.status === "completed",
            ...(task.status === "completed" ? { response: { generateVideoResponse: { generatedSamples: [{ video: { uri: `${url.origin}/media/fixture.mp4` } }] } } } : {}),
        });
    }

    if (request.method === "POST" && GLOBAL_AIOPC_IMAGE_PATHS.has(path)) {
        const id = nextTaskId("image");
        tasks.set(id, { kind: "image", status: "completed" });
        return sendJson(response, 200, { task_id: id, status: "queued" });
    }
    if (request.method === "POST" && ["/images/generations", "/images/edits"].includes(path)) {
        const model = requestedModel(body, request.headers["content-type"] || "");
        if (options.failImage || shouldFailRequest(request, model)) return sendJson(response, options.failImage || model.includes("-fail") ? 400 : 503, { error: { message: "fixture image failure" } });
        return sendJson(response, 200, { created: Math.floor(Date.now() / 1000), data: [{ b64_json: (await fixtureImage(options)).toString("base64"), revised_prompt: "protocol fixture" }] });
    }
    if (request.method === "POST" && ["/sdapi/v1/txt2img", "/sdapi/v1/img2img"].includes(path)) {
        return sendJson(response, 200, { images: [(await fixtureImage(options)).toString("base64")], info: "{}" });
    }
    if (request.method === "POST" && path === "/custom/images") {
        return sendJson(response, 200, { data: { image_url: `${url.origin}/media/fixture.png` } });
    }

    if (request.method === "POST" && (GLOBAL_AIOPC_VIDEO_PATHS.has(path) || ["/videos", "/contents/generations/tasks", "/seedance-special/videos"].includes(path))) {
        const model = requestedModel(body, request.headers["content-type"] || "");
        if (shouldFailRequest(request, model)) return sendJson(response, model.includes("-fail") ? 400 : 503, { error: { message: "fixture video failure" } });
        const id = nextTaskId("video");
        tasks.set(id, { kind: "video", status: model.includes("-slow") ? "pending" : "completed" });
        return sendJson(response, 200, { id, task_id: id, status: "queued" });
    }
    if (request.method === "POST" && path === "/videos/generations") {
        if (
            !String(request.headers["content-type"] || "")
                .toLowerCase()
                .includes("application/json")
        )
            return sendJson(response, 415, { code: "invalid_content_type", message: "VOZEB recommended video requests must use application/json", data: null });
        const payload = jsonBody(body);
        if (payload.model === "Seedance 2.0-fast-720p" && payload.generate_audio !== false) return sendJson(response, 400, { code: "invalid_request", message: "generate_audio must be false", data: null });
        const id = nextTaskId("vozeb-video");
        tasks.set(id, { kind: "vozeb-video", status: "completed" });
        return sendJson(response, 200, { id, task_id: id, object: "video", model: payload.model, status: "queued", progress: 0, created_at: 0 });
    }
    if (request.method === "POST" && path === YUMENG_MODEL_CENTER_TASK_PATH) {
        const payload = jsonBody(body);
        const model = String(payload.model || "");
        const kind = /image|seedream/i.test(model) ? "yumeng-image" : "yumeng-video";
        const id = nextTaskId(kind);
        tasks.set(id, { kind, status: "completed", model });
        return sendJson(response, 200, { task_id: id, status: "queued" });
    }
    const yumengTaskPrefix = `${YUMENG_MODEL_CENTER_TASK_PATH}/`;
    const yumengTaskId = path.startsWith(yumengTaskPrefix) ? path.slice(yumengTaskPrefix.length) : "";
    if (request.method === "GET" && yumengTaskId) {
        const id = decodeURIComponent(yumengTaskId);
        const task = tasks.get(id);
        if (!task || !String(task.kind).startsWith("yumeng-")) return sendJson(response, 404, { code: 404, message: "昱梦任务不存在" });
        const resultUrl = task.kind === "yumeng-image" ? `${url.origin}/media/fixture.png` : `${url.origin}/media/fixture.mp4`;
        return sendJson(response, 200, { task_id: id, status: "completed", result_url: resultUrl });
    }
    if (request.method === "POST" && path === "/custom/videos") {
        const id = nextTaskId("custom-video");
        tasks.set(id, { kind: "custom-video", status: "completed" });
        return sendJson(response, 200, { data: { task_id: id, status: "queued" } });
    }
    const customVideoId = path.match(/^\/custom\/results\/([^/]+)$/)?.[1];
    if (request.method === "GET" && customVideoId) {
        return sendJson(response, 200, { data: { task_id: decodeURIComponent(customVideoId), status: "completed", video_url: `${url.origin}/media/fixture.mp4` } });
    }
    const vozebVideoId = path.match(/^\/videos\/generations\/([^/]+)$/)?.[1];
    if (request.method === "GET" && vozebVideoId) {
        const id = decodeURIComponent(vozebVideoId);
        return sendJson(response, 200, { id, task_id: id, object: "video", status: "completed", progress: 100, metadata: { url: `${url.origin}/media/fixture.mp4` } });
    }
    const videoId = videoTaskId(path);
    if (request.method === "GET" && videoId) {
        const mediaUrl = `${url.origin}/media/fixture.mp4`;
        const task = tasks.get(videoId);
        if (task?.kind === "image") return sendJson(response, 200, { task_id: videoId, status: "completed", image_url: `${url.origin}/media/fixture.png` });
        if (task?.status === "pending") return sendJson(response, 200, { id: videoId, task_id: videoId, status: "processing" });
        if (task?.status === "cancelled") return sendJson(response, 200, { id: videoId, task_id: videoId, status: "cancelled" });
        return sendJson(response, 200, { id: videoId, task_id: videoId, status: "completed", video_url: mediaUrl, content: { video_url: mediaUrl }, result: { video_url: mediaUrl } });
    }
    if (request.method === "GET" && path === "/media/fixture.mp4") {
        const bytes = options.videoPath ? await readFile(options.videoPath) : FALLBACK_MP4;
        return sendBytes(response, 200, "video/mp4", bytes);
    }
    if (request.method === "GET" && path === "/media/fixture.png") return sendBytes(response, 200, "image/png", await fixtureImage(options));

    if (request.method === "POST" && path === "/audio/speech") {
        const model = requestedModel(body, request.headers["content-type"] || "");
        if (shouldFailRequest(request, model)) return sendJson(response, model.includes("-fail") ? 400 : 503, { error: { message: "fixture audio failure" } });
        return sendBytes(response, 200, "audio/wav", createWave());
    }
    if (request.method === "POST" && path === "/custom/audio") return sendJson(response, 200, { data: { audio_url: `${url.origin}/media/fixture.wav` } });
    if (request.method === "GET" && path === "/media/fixture.wav") return sendBytes(response, 200, "audio/wav", createWave());
    if ((request.method === "POST" || request.method === "DELETE") && /\/(?:cancel|videos\/[^/]+)$/.test(path)) {
        const id = videoTaskId(path.replace(/\/cancel$/, ""));
        if (id && tasks.has(id)) tasks.set(id, { ...tasks.get(id), status: "cancelled" });
        return sendJson(response, 200, { status: "cancelled" });
    }

    sendJson(response, 404, { error: { message: `fixture route not found: ${request.method} ${url.pathname}` } });
}

function selectedToolName(payload) {
    const choice = payload.tool_choice;
    if (choice?.name) return choice.name;
    if (choice?.function?.name) return choice.function.name;
    const tool = Array.isArray(payload.tools) ? payload.tools[0] : undefined;
    const explicit = tool?.name || tool?.function?.name || "";
    if (explicit) return explicit;
    const source = JSON.stringify(payload);
    return ["create_agent_plan", "plan_workbench_action", "review_creative_outputs", "analyze_drama_content", "design_drama_visuals", "make_plan"].find((name) => source.includes(name)) || "";
}

function toolArguments(name, payload) {
    if (name === "create_agent_plan") {
        return {
            intent: "generation",
            objective: "验证 Canvas Agent 稳定生成链路",
            audience: "协议测试用户",
            reply: "已收到，我会生成一张横版协议测试图片。",
            decisions: [{ label: "模型", value: "mock-image", reason: "使用本地协议测试模型" }],
            deliverables: [{ id: "fixture-image", title: "协议测试图片", type: "image", model: "mock-image", prompt: "生成一张蓝色横版协议测试图片", count: 1, ratio: "16:9", quality: "high", dependencies: [] }],
        };
    }
    if (name === "plan_workbench_action") {
        return {
            intent: "generation",
            foundation: { complexity: "simple", brief: { objective: "验证工作台协议生成" }, direction: { summary: "清晰的蓝色测试画面" } },
            deliverables: [{ title: "协议测试图片", type: "image", role: "主画面" }],
            parameterPatch: { model: "mock-image", size: "1024x1024", quality: "high", count: 1 },
            resolvedPrompt: "生成一张蓝色协议测试图片",
            shouldGenerate: true,
            reply: "已收到，我会生成协议测试图片。",
            decisions: [{ label: "模型", value: "mock-image", reason: "本地协议测试" }],
            choices: [],
        };
    }
    if (name === "review_creative_outputs") return { mode: "visual", status: "passed", score: 100, summary: "协议测试产物通过", issues: [], retryTaskIds: [] };
    if (name === "analyze_drama_content") {
        return {
            episode: { outline: "主角进入测试场景并完成一句对白。", hook: "门突然打开。", nextPreview: "下一幕继续。", sourceRange: "全文" },
            characters: [{ name: "主角", description: "协议测试角色" }],
            scenes: [{ name: "测试房间", description: "明亮整洁的房间" }],
            props: [],
            clues: [],
            shots: [
                {
                    title: "进入房间",
                    description: "主角推门进入房间。",
                    sourceText: "主角推门说：测试开始。",
                    shotBoundary: "角色进入形成新镜头",
                    dialogue: "测试开始。",
                    narration: "",
                    utterances: [{ type: "dialogue", speaker: "主角", text: "测试开始。" }],
                    duration: 5,
                    characterNames: ["主角"],
                    sceneName: "测试房间",
                    propNames: [],
                    clueNames: [],
                },
            ],
        };
    }
    if (name === "design_drama_visuals") {
        return {
            shots: [
                {
                    shotId: firstShotId(payload) || "shot-1",
                    imagePrompt: "主角推门进入明亮房间",
                    videoPrompt: "镜头缓慢推进，主角推门进入",
                    cameraMotion: "缓慢推进",
                    startFramePrompt: "关闭的房门",
                    endFramePrompt: "主角站在房间中央",
                    negativePrompt: "模糊，畸形",
                    continuity: {
                        shotSize: "中景",
                        cameraAngle: "平视",
                        composition: "主体居中",
                        characterBlocking: "主角从左向右进入",
                        gazeDirection: "看向前方",
                        actionStart: "推门",
                        actionEnd: "站定",
                        screenDirection: "左到右",
                        axisRule: "保持180度轴线",
                        continuityNotes: "保持角色服装和场景一致",
                    },
                },
            ],
        };
    }
    return {};
}

function firstShotId(payload) {
    const source = JSON.stringify(payload.input || payload.messages || "");
    return source.match(/shot-[A-Za-z0-9_-]+/)?.[0] || "";
}

function videoTaskId(path) {
    const patterns = [/^\/videos\/([^/]+)$/, /^\/contents\/generations\/tasks\/([^/]+)$/, /^\/result\/([^/]+)$/];
    for (const pattern of patterns) {
        const match = path.match(pattern);
        if (match) return decodeURIComponent(match[1]);
    }
    return "";
}

function fixturePath(pathname) {
    const internal = pathname.replace(/^\/api\/ai\/system\/[^/]+(?=\/)/, "");
    return internal.replace(/^\/(?:api\/v3|v1beta|v1)(?=\/)/, "");
}

function createWave() {
    const sampleRate = 8_000;
    const samples = 800;
    const dataSize = samples * 2;
    const wave = Buffer.alloc(44 + dataSize);
    wave.write("RIFF", 0);
    wave.writeUInt32LE(36 + dataSize, 4);
    wave.write("WAVEfmt ", 8);
    wave.writeUInt32LE(16, 16);
    wave.writeUInt16LE(1, 20);
    wave.writeUInt16LE(1, 22);
    wave.writeUInt32LE(sampleRate, 24);
    wave.writeUInt32LE(sampleRate * 2, 28);
    wave.writeUInt16LE(2, 32);
    wave.writeUInt16LE(16, 34);
    wave.write("data", 36);
    wave.writeUInt32LE(dataSize, 40);
    for (let index = 0; index < samples; index += 1) wave.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 4_000), 44 + index * 2);
    return wave;
}

function fixtureImage(options) {
    return options.imagePath ? readFile(options.imagePath) : Promise.resolve(Buffer.from(PNG_BASE64, "base64"));
}

async function readRequestBody(request) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    return Buffer.concat(chunks);
}

function jsonBody(body) {
    try {
        return JSON.parse(body.toString("utf8") || "{}");
    } catch {
        return {};
    }
}

function requestedModel(body, contentType = "") {
    if (String(contentType).includes("application/json")) {
        const payload = jsonBody(body);
        return String(payload.model || payload.deployment || "");
    }
    const text = body.toString("utf8");
    return text.match(/name="model"\r?\n\r?\n([^\r\n]+)/i)?.[1]?.trim() || "";
}

function shouldFailRequest(request, model) {
    if (!model) return false;
    if (model.includes("-fail")) return true;
    return model.includes("-fallback") && String(request.headers.authorization || "").includes("e2e-primary-secret");
}

function sendJson(response, status, value) {
    sendBytes(response, status, "application/json; charset=utf-8", Buffer.from(JSON.stringify(value)));
}

function sendBytes(response, status, contentType, bytes) {
    response.writeHead(status, { "content-type": contentType, "content-length": bytes.length, "cache-control": "no-store" });
    response.end(bytes);
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const port = Number(process.env.VOZEB_PRO_PROTOCOL_FIXTURE_PORT) || 4010;
    const host = process.env.VOZEB_PRO_PROTOCOL_FIXTURE_HOST || "127.0.0.1";
    const fixture = createProtocolFixtureServer({
        imagePath: process.env.VOZEB_PRO_PROTOCOL_FIXTURE_IMAGE,
        videoPath: process.env.VOZEB_PRO_PROTOCOL_FIXTURE_VIDEO,
        responseDelayMs: process.env.VOZEB_PRO_PROTOCOL_FIXTURE_DELAY_MS,
        failImage: process.env.VOZEB_PRO_PROTOCOL_FIXTURE_FAIL_IMAGE === "1",
    });
    fixture.server.listen(port, host, () => console.log(`Protocol fixture ready at http://${host}:${port}`));
}
