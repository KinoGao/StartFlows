import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GLOBAL_AIOPC_PRESETS } from "@/lib/globalaiopc-catalog";
import { createProtocolFixtureServer } from "../../../scripts/protocol-fixture-server.mjs";
import { runOpenAiImageTask } from "@/app/api/image-tasks/image-task-openai";
import { pollOpenAiImageTask } from "@/app/api/image-tasks/image-task-support";
import { createUpstream } from "@/app/api/video-generation-tasks/video-generation-route";
import { queryVideoTaskUpstream } from "./video-task-runtime";
import type { ImageTask } from "@/lib/server/image-task-store";
import type { VideoTask } from "@/lib/server/video-task-store";
import { emptyAdvancedConfig } from "@/lib/channel-protocol-registry";

describe("GlobalAiOpc media protocol matrix over TCP fixtures", () => {
    let close: (() => Promise<void>) | undefined;

    afterEach(async () => {
        await close?.();
        close = undefined;
        vi.unstubAllEnvs();
    });

    beforeEach(() => {
        vi.stubEnv("VOZEB_PRO_ALLOW_PRIVATE_UPSTREAMS", "1");
        vi.stubEnv("VOZEB_PRO_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1");
    });

    it("creates and queries every registered image and video preset exactly once", async () => {
        const fixture = createProtocolFixtureServer();
        await new Promise<void>((resolve) => fixture.server.listen(0, "127.0.0.1", resolve));
        const address = fixture.server.address();
        if (!address || typeof address === "string") throw new Error("Protocol fixture did not bind a TCP port");
        const origin = "http://127.0.0.1:" + address.port;
        close = () => new Promise<void>((resolve, reject) => fixture.server.close((error?: Error) => (error ? reject(error) : resolve())));

        const imagePresets = GLOBAL_AIOPC_PRESETS.filter((preset) => preset.capability === "image");
        const videoPresets = GLOBAL_AIOPC_PRESETS.filter((preset) => preset.capability === "video");

        for (const [index, preset] of imagePresets.entries()) {
            const task: ImageTask = {
                id: "image-matrix-" + index,
                userId: "matrix-user",
                username: "matrix",
                displayName: "Matrix",
                kind: "generation",
                source: "image-workbench",
                status: "running",
                createdAt: 1,
                updatedAt: 1,
                config: {
                    baseUrl: origin,
                    apiKey: "matrix-key",
                    apiFormat: "openai",
                    model: preset.modelExamples[0],
                    channelId: "matrix-image-" + index,
                    advancedConfig: { ...emptyAdvancedConfig(), protocol: "globalaiopc", globalAiOpcPreset: preset.id as never, createPath: preset.createPath, queryPath: preset.queryPath || "" },
                },
                candidateConfigs: [],
                prompt: "matrix image " + preset.id,
                references: [],
            };
            const submitted = await runOpenAiImageTask(task, "", "", "", true);
            expect(submitted.pending?.id).toMatch(/^fixture-image-/);
            const result = await pollOpenAiImageTask(task.config, submitted.pending!.id, origin, origin, "", "", true);
            expect(result.dataUrl || result.remoteUrl).toBeTruthy();
        }

        for (const [index, preset] of videoPresets.entries()) {
            const config = {
                apiSource: "system" as const,
                baseUrl: origin,
                apiKey: "system" as const,
                apiFormat: "openai" as const,
                model: preset.modelExamples[0],
                logicalModel: "video",
                channelId: "matrix-video-" + index,
                advancedConfig: {
                    ...emptyAdvancedConfig(),
                    protocol: "globalaiopc" as const,
                    globalAiOpcPreset: preset.id as never,
                    createPath: preset.createPath,
                    queryPath: preset.queryPath || "",
                    supportsReferenceImage: Boolean(preset.supportsReferenceImage),
                    supportsReferenceVideo: Boolean(preset.supportsReferenceVideo),
                    supportsReferenceAudio: Boolean(preset.supportsReferenceAudio),
                },
            };
            const upstream = await createUpstream(
                "matrix-user",
                "",
                "",
                config,
                "matrix video " + preset.id,
                { videoSeconds: 5, size: "16:9", vquality: "720" },
                [],
                { imageQuality: {}, videoQuality: { "720": 1 }, videoSeconds: { "5": 1 } },
                "matrix-video-request-" + index,
            );
            expect(upstream.id).toMatch(/^fixture-video-/);
            const result = await queryVideoTaskUpstream({ config, upstream, userId: "matrix-user" } as unknown as VideoTask, "", "");
            expect(result).toMatchObject({ state: "result_ready", resultUrl: expect.stringContaining("/media/fixture.mp4") });
        }

        const createRequests = fixture.requests.filter((request) => (request.method === "POST" && request.path.includes("/images")) || (request.method === "POST" && request.path.includes("/videos")));
        expect(createRequests).toHaveLength(imagePresets.length + videoPresets.length);
        expect(createRequests.every((request) => request.headers.authorization === "Bearer matrix-key" || request.headers["idempotency-key"]?.startsWith("matrix-video-request-"))).toBe(true);
        expect(new Set(createRequests.map((request) => request.headers["idempotency-key"])).size).toBe(createRequests.length);
    });
});
