import assert from "node:assert/strict";
import { test } from "vitest";

import { buildScriptAiPrompt, buildScriptBeatPrompt, parseScriptAiResponse } from "./canvas-script-ai";

const SAMPLE_JSON = JSON.stringify({
    assets: [
        { kind: "character", name: "林小雨", description: "20 岁女大学生，白色连衣裙，长发，气质清冷" },
        { kind: "scene", name: "教学楼走廊", description: "午后阳光斜照的校园走廊，干净明亮" },
    ],
    acts: [{ title: "第一幕", name: "相遇", summary: "林小雨在走廊与男主擦肩", duration: "约 20 分钟" }],
    beats: [
        { act: "第一幕", title: "开场", content: "林小雨抱书走过走廊，阳光洒在她脸上", shotType: "中景", duration: "3s", character: "林小雨", scene: "教学楼走廊", camera: "中景跟拍", dialogue: "今天也要加油。" },
        { act: "第一幕", title: "回眸", content: "她停下回头，微微抿嘴笑", shotType: "近景", duration: "2s", character: "林小雨", scene: "教学楼走廊", camera: "特写推近", dialogue: "" },
    ],
});

test("buildScriptAiPrompt 包含资产、幕与分镜字段要求与 JSON 输出格式", () => {
    const prompt = buildScriptAiPrompt("林小雨走进教室。");
    assert.ok(prompt.includes("assets"));
    assert.ok(prompt.includes("character"));
    assert.ok(prompt.includes("acts"));
    assert.ok(prompt.includes("shotType"));
    assert.ok(prompt.includes("只输出一个 JSON 对象"));
    assert.ok(prompt.includes("林小雨走进教室。"));
});

test("parseScriptAiResponse 解析标准 JSON", () => {
    const { beats, assets, acts } = parseScriptAiResponse(SAMPLE_JSON);
    assert.equal(assets.length, 2);
    assert.equal(assets[0].kind, "character");
    assert.equal(assets[0].name, "林小雨");
    assert.equal(beats.length, 2);
    assert.equal(beats[0].character, "林小雨");
    assert.equal(beats[0].camera, "中景跟拍");
    assert.equal(beats[0].dialogue, "今天也要加油。");
    assert.equal(beats[0].scene, "教学楼走廊");
    assert.equal(beats[0].act, "第一幕");
    assert.equal(acts.length, 1);
    assert.equal(acts[0].title, "第一幕");
    assert.equal(acts[0].name, "相遇");
    assert.equal(acts[0].duration, "约 20 分钟");
});

test("parseScriptAiResponse 容忍代码围栏与前后说明文字", () => {
    const text = `以下是拆解结果：\n\`\`\`json\n${SAMPLE_JSON}\n\`\`\`\n以上是完整分镜。`;
    const { beats, assets, acts } = parseScriptAiResponse(text);
    assert.equal(beats.length, 2);
    assert.equal(assets.length, 2);
    assert.equal(acts.length, 1);
});

test("parseScriptAiResponse 保留多幕全部分镜（不截断第二幕）", () => {
    const multiAct = JSON.stringify({
        acts: [
            { title: "第一幕", name: "谜面", duration: "约 30 分钟" },
            { title: "第二幕", name: "解读与分裂", duration: "约 45 分钟" },
        ],
        beats: Array.from({ length: 30 }, (_, i) => ({
            act: i < 15 ? "第一幕" : "第二幕",
            title: `镜头 ${i + 1}`,
            content: `画面内容 ${i + 1}`,
        })),
    });
    const { beats, acts } = parseScriptAiResponse(multiAct);
    assert.equal(beats.length, 30, "长剧本全部分镜都应保留");
    assert.equal(acts.length, 2, "两幕都应保留");
    assert.equal(acts[1].name, "解读与分裂");
    const actTwoCount = beats.filter((beat) => beat.act === "第二幕").length;
    assert.equal(actTwoCount, 15, "第二幕的分镜不应丢失");
});

test("parseScriptAiResponse 非法输入返回空结构", () => {
    assert.deepEqual(parseScriptAiResponse(""), { beats: [], assets: [], acts: [] });
    assert.deepEqual(parseScriptAiResponse("模型没有返回有效内容"), { beats: [], assets: [], acts: [] });
    assert.deepEqual(parseScriptAiResponse("[]"), { beats: [], assets: [], acts: [] });
    assert.deepEqual(parseScriptAiResponse('{"beats":"oops"}'), { beats: [], assets: [], acts: [] });
});

test("parseScriptAiResponse 缺字段容错并生成默认 prompt", () => {
    const { beats } = parseScriptAiResponse('{"beats":[{"content":"主角推门而入"}]}');
    assert.equal(beats.length, 1);
    assert.equal(beats[0].title, "主角推门而入".slice(0, 12));
    assert.ok(beats[0].prompt.includes("主角推门而入"));
});

test("buildScriptBeatPrompt 引用角色/场景资产描述与台词", () => {
    const { beats, assets } = parseScriptAiResponse(SAMPLE_JSON);
    const prompt = buildScriptBeatPrompt(beats[0], assets);
    assert.ok(prompt.includes("林小雨"));
    assert.ok(prompt.includes("教学楼走廊"));
    assert.ok(prompt.includes("今天也要加油。"));
});
