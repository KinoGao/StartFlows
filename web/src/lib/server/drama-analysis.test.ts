import { describe, expect, it } from "vitest";

import { describeDramaModelOutput, hasUsableDramaToolArguments, normalizeDramaContentAnalysis, normalizeDramaVisualAnalysis, readDramaChatArguments, readDramaResponsesArguments, readDramaUpstreamError } from "./drama-analysis";

describe("drama analysis contracts", () => {
    it("keeps content facts separate from visual prompts", () => {
        const result = normalizeDramaContentAnalysis(
            {
                episode: { outline: "大纲", hook: "钩子", nextPreview: "预告", sourceRange: "第一章" },
                characters: [{ name: "女主", description: "红衣", profile: { visualIdentity: "短发", styling: "红衣", colorPalette: "红黑", consistencyRules: "服装不变" } }],
                scenes: [{ name: "天台", description: "夜晚" }],
                props: [{ name: "钥匙", description: "铜钥匙" }],
                clues: [
                    { name: "", description: "空项", payoff: "错误回收" },
                    { name: "血迹", description: "门边血迹", payoff: "第三幕揭示" },
                ],
                shots: [
                    {
                        title: "发现",
                        description: "女主发现血迹",
                        sourceText: "她在门边看见一滴血。",
                        shotBoundary: "发现信息后切镜",
                        dialogue: "谁来过？",
                        narration: "",
                        utterances: [{ type: "dialogue", speaker: "女主", text: "谁来过？" }],
                        duration: 7,
                        characterNames: ["女主"],
                        sceneName: "天台",
                        propNames: ["钥匙"],
                        clueNames: ["血迹"],
                        imagePrompt: "不应进入内容结构",
                    },
                ],
            },
            5,
        );

        expect(result.clues).toEqual([expect.objectContaining({ name: "血迹", payoff: "第三幕揭示" })]);
        expect(result.characters[0]).toMatchObject({ profile: { visualIdentity: "短发", consistencyRules: "服装不变" } });
        expect(result.shots[0]).toMatchObject({ sourceText: "她在门边看见一滴血。", duration: 7, clueNames: ["血迹"] });
        expect(result.shots[0]).not.toHaveProperty("imagePrompt");
    });

    it("restores every direct line from the source script and rejects narrative summaries", () => {
        const script = ["一旁的女人再次开口：“俊成家的，你还好吗？”", "郁心妍闭着眼回了一句：“我没事，就是有些头晕。”", "“你等着，我这就去给你叫医生。”", "郁心妍刚想说：不用，她缓一下就没事了。"].join("\n");
        const result = normalizeDramaContentAnalysis(
            {
                episode: { outline: "大纲", hook: "钩子", nextPreview: "预告", sourceRange: "第一章" },
                characters: [],
                scenes: [],
                props: [],
                clues: [],
                shots: [
                    {
                        title: "病房问候",
                        description: "女人关心郁心妍的状态",
                        sourceText: "一旁的女人再次开口：“俊成家的，你还好吗？”",
                        shotBoundary: "问候后切镜",
                        dialogue: "女人说明自己关心郁心妍。",
                        narration: "",
                        utterances: [],
                        duration: 5,
                        characterNames: [],
                        sceneName: "",
                        propNames: [],
                        clueNames: [],
                    },
                ],
            },
            5,
            script,
        );

        expect(result.shots.flatMap((shot) => shot.utterances.map((item) => item.text))).toEqual(["俊成家的，你还好吗？", "我没事，就是有些头晕。", "你等着，我这就去给你叫医生。", "不用，她缓一下就没事了。"]);
        expect(result.shots.flatMap((shot) => shot.utterances.map((item) => item.speaker)).slice(0, 2)).toEqual(["女人", "郁心妍"]);
        expect(result.shots[0].dialogue).not.toContain("说明自己");
    });

    it("keeps repeated dialogue occurrences instead of deduplicating by text", () => {
        const script = "她点点头：“好。”\n走到门口，她又回头：“好。”";
        const result = normalizeDramaContentAnalysis(
            {
                episode: { outline: "大纲", hook: "", nextPreview: "", sourceRange: "第一章" },
                characters: [],
                scenes: [],
                props: [],
                clues: [],
                shots: [
                    {
                        title: "第一次回应",
                        description: "她点头回应",
                        sourceText: "她点点头：“好。”",
                        shotBoundary: "动作结束",
                        dialogue: "好。",
                        narration: "",
                        utterances: [],
                        duration: 4,
                        characterNames: [],
                        sceneName: "",
                        propNames: [],
                        clueNames: [],
                    },
                ],
            },
            5,
            script,
        );

        expect(result.shots[0].utterances.filter((item) => item.type === "dialogue").map((item) => item.text)).toEqual(["好。", "好。"]);
    });

    it("only accepts visual fields for reviewed shot ids", () => {
        expect(
            normalizeDramaVisualAnalysis(
                {
                    shots: [
                        {
                            shotId: "shot-one",
                            imagePrompt: "夜景中景",
                            videoPrompt: "缓慢推进",
                            cameraMotion: "dolly in",
                            startFramePrompt: "抬头前",
                            endFramePrompt: "抬头后",
                            negativePrompt: "身份漂移",
                            continuity: {
                                shotSize: "中景",
                                cameraAngle: "平视",
                                composition: "居中",
                                characterBlocking: "女主在门边",
                                gazeDirection: "向左",
                                actionStart: "低头",
                                actionEnd: "抬头",
                                screenDirection: "向左",
                                axisRule: "不越轴",
                                continuityNotes: "服装不变",
                            },
                        },
                        { shotId: "unknown", imagePrompt: "错误", videoPrompt: "错误", cameraMotion: "" },
                        { shotId: "shot-one", imagePrompt: "重复", videoPrompt: "重复", cameraMotion: "" },
                    ],
                },
                ["shot-one"],
            ),
        ).toEqual({
            shots: [
                {
                    shotId: "shot-one",
                    imagePrompt: "夜景中景",
                    videoPrompt: "缓慢推进",
                    cameraMotion: "dolly in",
                    startFramePrompt: "抬头前",
                    endFramePrompt: "抬头后",
                    negativePrompt: "身份漂移",
                    continuity: {
                        shotSize: "中景",
                        cameraAngle: "平视",
                        composition: "居中",
                        characterBlocking: "女主在门边",
                        gazeDirection: "向左",
                        actionStart: "低头",
                        actionEnd: "抬头",
                        screenDirection: "向左",
                        axisRule: "不越轴",
                        continuityNotes: "服装不变",
                    },
                },
            ],
        });
    });

    it("turns upstream failures into actionable messages", () => {
        expect(readDramaUpstreamError('{"error":{"message":"无可用账号，请稍后重试"}}', 502)).toBe("无可用账号，请稍后重试");
        expect(readDramaUpstreamError("", 502)).toBe("文本模型渠道暂不可用（HTTP 502）");
        expect(readDramaUpstreamError("", 401)).toBe("文本模型渠道鉴权失败，请管理员检查账号和密钥");
    });

    it("accepts strict JSON when a channel returns content instead of a tool call", () => {
        expect(readDramaChatArguments({ choices: [{ message: { content: '```json\n{"shots":[]}\n```' } }] }, "analyze_drama_content")).toBe('{"shots":[]}');
        expect(readDramaResponsesArguments({ output: [{ type: "message", content: [{ type: "output_text", text: '{"shots":[]}' }] }] }, "analyze_drama_content")).toBe('{"shots":[]}');
    });

    it("accepts common provider variants without accepting surrounding prose", () => {
        expect(readDramaResponsesArguments({ output_text: '{"shots":[]}' }, "analyze_drama_content")).toBe('{"shots":[]}');
        expect(readDramaResponsesArguments({ output: [{ type: "function_call", name: "analyze_drama_content", arguments: { shots: [] } }] }, "analyze_drama_content")).toBe('{"shots":[]}');
        expect(readDramaChatArguments({ choices: [{ message: { content: [{ type: "text", text: '{"shots":[]}' }] } }] }, "analyze_drama_content")).toBe('{"shots":[]}');
        expect(readDramaChatArguments({ choices: [{ message: { function_call: { name: "analyze_drama_content", arguments: { shots: [] } } } }] }, "analyze_drama_content")).toBe('{"shots":[]}');
        expect(readDramaChatArguments({ choices: [{ message: { content: '结果如下：{"shots":[]}' } }] }, "analyze_drama_content")).toBe("");
    });

    it("rejects echoed input and empty structured results", () => {
        expect(hasUsableDramaToolArguments('{"script":"原始剧本","summary":"简介"}', "analyze_drama_content")).toBe(false);
        expect(hasUsableDramaToolArguments('{"episode":{"outline":"大纲"},"shots":[{"title":"镜头一"}]}', "analyze_drama_content")).toBe(true);
        expect(hasUsableDramaToolArguments('{"shots":[{"shotId":"shot-one"}]}', "design_drama_visuals")).toBe(true);
    });

    it("describes response shape without including model content", () => {
        expect(describeDramaModelOutput({ output_text: "private", choices: [{ message: { content: [{ type: "text", text: "private" }], tool_calls: [{ function: { name: "analyze_drama_content", arguments: "private" } }] } }] })).toEqual({
            topLevelKeys: ["output_text", "choices"],
            outputTextType: "string",
            output: [],
            choices: [{ contentType: "array", toolCallCount: 1, toolNames: ["analyze_drama_content"], functionCallName: "" }],
        });
    });
});
