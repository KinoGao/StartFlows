import { describe, expect, it } from "vitest";

import { parseDeterministicProtocolDraft, protocolDraftFromUnknown, redactProtocolSecrets } from "./channel-protocol-draft";
import { safeProtocolDocumentationUrl } from "./channel-protocol-security";

describe("custom channel protocol drafts", () => {
    it("extracts a complete image operation and model catalog from examples", () => {
        const draft = parseDeterministicProtocolDraft({
            text: `GET https://api.example.com/v1/models
curl --url https://api.example.com/v1/images/generations --header 'Authorization: Bearer secret-value' --data '{"model":"image-one","prompt":"test"}'
{"data":[{"url":"https://cdn.example.com/out.png"}]}
curl --url https://api.example.com/v1/images/edits --header 'Authorization: Bearer secret-value' --data '{"model":"image-one","prompt":"test","image":"https://cdn.example.com/ref.png"}'
{"data":[{"url":"https://cdn.example.com/out.png"}]}`,
        });
        expect(draft?.modelCatalogPaths).toEqual(["/v1/models"]);
        expect(draft?.operations).toHaveLength(1);
        expect(draft?.operations[0]).toMatchObject({ capability: "image", models: ["image-one"], config: { createPath: "/images/generations", editPath: "/images/edits", resultField: "data[0].url" } });
    });

    it("accepts multiple capabilities and operations without static models when a catalog exists", () => {
        const draft = protocolDraftFromUnknown({
            baseUrl: "https://api.example.com/v1",
            authMode: "bearer",
            modelCatalogPaths: ["/v1/models"],
            operations: [
                { capability: "text", models: [], config: { createPath: "/chat/completions", requestTemplate: '{"model":"{{model}}","messages":"{{messages}}"}', resultField: "choices[0].message.content" } },
                {
                    capability: "video",
                    models: ["video-one"],
                    config: {
                        createPath: "/videos",
                        queryPath: "/videos/:task_id",
                        cancelPath: "/videos/:task_id/cancel",
                        cancelMethod: "POST",
                        requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}"}',
                        resultField: "data.video_url",
                    },
                },
            ],
        });
        expect(draft?.operations.map((item) => item.capability)).toEqual(["text", "video"]);
        expect(draft?.operations[1].config).toMatchObject({ cancelPath: "/videos/:task_id/cancel", cancelMethod: "POST" });
    });

    it("accepts explicit first-frame and last-frame video template variables", () => {
        const draft = protocolDraftFromUnknown({
            baseUrl: "https://api.example.com/v1",
            authMode: "bearer",
            operations: [
                {
                    capability: "video",
                    models: ["video-frames"],
                    config: {
                        createPath: "/videos",
                        requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}","first_frame":"{{first_frame}}","first_frame_url":"{{first_frame_url}}","last_frame":"{{last_frame}}","last_frame_url":"{{last_frame_url}}"}',
                        resultField: "data.video_url",
                    },
                },
            ],
        });

        expect(draft?.operations[0].config.requestTemplate).toContain("{{last_frame_url}}");
    });

    it("extracts every capability path from one relative multi-endpoint example", () => {
        const draft = parseDeterministicProtocolDraft({
            text: `GET /v1/models
Response {"data":[{"id":"writer-v1","capability":"text"},{"id":"image-v1","capability":"image"},{"id":"video-v1","capability":"video"}]}
POST /v1/chat/completions
Body {"model":"{{model}}","messages":"{{messages}}"}
Response {"choices":[{"message":{"content":"ok"}}]}
POST /v1/images/generations
Body {"model":"{{model}}","prompt":"{{prompt}}","size":"{{size}}"}
Response {"data":[{"url":"https://cdn.example.com/image.png"}]}
POST /v1/videos
Body {"model":"{{model}}","prompt":"{{prompt}}","duration":"{{duration}}"}
Response {"id":"task-1","status":"queued"}
GET /v1/videos/:task_id
Response {"status":"succeeded","result":{"url":"https://cdn.example.com/video.mp4"}}
DELETE /v1/videos/:task_id`,
        });

        expect(draft?.modelCatalogPaths).toEqual(["/v1/models"]);
        expect(draft?.operations.map((item) => item.capability)).toEqual(["text", "image", "video"]);
        expect(draft?.operations.every((item) => item.models.length === 0)).toBe(true);
        expect(draft?.operations[0].config.createPath).toBe("/v1/chat/completions");
        expect(draft?.operations[1].config.createPath).toBe("/v1/images/generations");
        expect(draft?.operations[2].config).toMatchObject({ createPath: "/v1/videos", queryPath: "/v1/videos/:task_id", cancelPath: "/v1/videos/:task_id", cancelMethod: "DELETE" });
    });

    it("redacts cookies, authorization values, and sensitive URL parameters", () => {
        const redacted = redactProtocolSecrets("Cookie: session=secret\nhttps://api.example.com/docs?token=secret&lang=zh\nAuthorization: Bearer sk-secretvalue");
        expect(redacted).not.toContain("session=secret");
        expect(redacted).not.toContain("token=secret");
        expect(redacted).not.toContain("sk-secretvalue");
        expect(redacted).toContain("token=[REDACTED]");
    });

    it("rejects documentation URLs that carry credentials or key-like query parameters", () => {
        expect(safeProtocolDocumentationUrl("https://user:pass@example.com/docs")).toBe("");
        expect(safeProtocolDocumentationUrl("https://example.com/docs?api_key=secret")).toBe("");
        expect(safeProtocolDocumentationUrl("https://example.com/docs?lang=zh")).toBe("https://example.com/docs?lang=zh");
    });

    it("rejects executable variables, unsafe paths, and model-free drafts without a catalog", () => {
        expect(
            protocolDraftFromUnknown({
                operations: [{ capability: "image", models: ["one"], config: { createPath: "/jobs", requestTemplate: '{"prompt":"{{process.mainModule}}"}', resultField: "url" } }],
            }),
        ).toBeNull();
        expect(
            protocolDraftFromUnknown({
                operations: [{ capability: "image", models: ["one"], config: { createPath: "https://evil.example/jobs", requestTemplate: '{"prompt":"{{prompt}}"}', resultField: "url" } }],
            }),
        ).toBeNull();
        expect(
            protocolDraftFromUnknown({
                operations: [{ capability: "image", models: [], config: { createPath: "/jobs", requestTemplate: '{"prompt":"{{prompt}}"}', resultField: "url" } }],
            }),
        ).toBeNull();
    });

    it("accepts an explicitly keyless custom protocol package", () => {
        expect(
            protocolDraftFromUnknown({
                authMode: "none",
                operations: [{ capability: "image", models: ["local-image"], config: { createPath: "/generate", requestTemplate: '{"prompt":"{{prompt}}"}', resultField: "image" } }],
            })?.authMode,
        ).toBe("none");
    });
});
