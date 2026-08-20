import assert from "node:assert/strict";
import { test } from "vitest";

import { buildGridBeatPrompt, buildScriptBeats, buildScriptBeatsWithActs, formatScriptBeatNodeTitle, GRID_SHOT_DESCRIPTIONS, inferScriptDuration, inferScriptShotType } from "./canvas-script-beats";

test("buildScriptBeats splits a multi-line script into one beat per line", () => {
    const beats = buildScriptBeats("第一幕：主角进入陌生空间。\n特写：发现关键道具。\n中景：推门前行。");

    assert.equal(beats.length, 3);
    assert.deepEqual(
        beats.map((beat) => beat.title),
        ["第一幕", "特写", "中景"],
    );
    assert.equal(beats[0].prompt.includes("主角进入陌生空间"), true);
    assert.equal(beats[0].id, "beat-1");
});

test("buildScriptBeats caps at six beats and prefers line breaks over sentences", () => {
    const beats = buildScriptBeats("1\n2\n3\n4\n5\n6\n7\n8\n9");

    assert.equal(beats.length, 6);
    assert.equal(beats[0].id, "beat-1");
    assert.equal(beats[5].id, "beat-6");
});

test("formatScriptBeatNodeTitle：镜号 + 分镜名，默认占位标题不重复拼接", () => {
    assert.equal(formatScriptBeatNodeTitle("image", 2, "规律尖峰"), "分镜图 #2·规律尖峰");
    assert.equal(formatScriptBeatNodeTitle("video", 5, "规律尖峰"), "分镜视频 #5·规律尖峰");
    assert.equal(formatScriptBeatNodeTitle("image", 3, "分镜 3"), "分镜图 #3");
    assert.equal(formatScriptBeatNodeTitle("video", 1), "分镜视频 #1");
    assert.equal(formatScriptBeatNodeTitle("image", 4, "  "), "分镜图 #4");
});

test("buildScriptBeats uses the default skeleton for an empty body", () => {
    const beats = buildScriptBeats("   \n  ");

    assert.deepEqual(
        beats.map((beat) => beat.content),
        ["建立场景", "角色行动", "情绪高潮"],
    );
    assert.deepEqual(
        beats.map((beat) => beat.title),
        ["分镜 1", "分镜 2", "分镜 3"],
    );
});

test("inferScriptShotType detects the shot keyword from content", () => {
    assert.equal(inferScriptShotType("特写：角色的眼睛"), "特写");
    assert.equal(inferScriptShotType("全景：街道全景"), "全景");
    assert.equal(inferScriptShotType("大远景：航拍城市"), "大远景");
    assert.equal(inferScriptShotType("角色走进房间"), undefined);
});

test("inferScriptDuration reads explicit seconds and defaults to 3s", () => {
    assert.equal(inferScriptDuration("镜头持续 5 秒"), "5s");
    assert.equal(inferScriptDuration("普通镜头"), "3s");
});

test("buildGridBeatPrompt cycles shot descriptions and keeps source text", () => {
    const prompt = buildGridBeatPrompt("正文", { title: "分镜 1", content: "主角奔跑" }, 0, 9);

    assert.ok(prompt.includes("第 1/9 格"));
    assert.ok(prompt.includes(GRID_SHOT_DESCRIPTIONS[0]));
    assert.ok(prompt.includes("主角奔跑"));

    const wrapped = buildGridBeatPrompt("正文", { title: "分镜 1", content: "主角奔跑" }, GRID_SHOT_DESCRIPTIONS.length, 9);
    assert.ok(wrapped.includes(GRID_SHOT_DESCRIPTIONS[0]), "shot description cycles after exhausting the list");
});

test("buildGridBeatPrompt falls back to body prefix when beat content is empty", () => {
    const prompt = buildGridBeatPrompt("  一段很长的正文描述  ", undefined, 0, 4);

    assert.ok(prompt.includes("一段很长的正文描述"));
});

const STRUCTURED_SCRIPT = [
    "【片名】回应",
    "【分镜表】",
    "◆ 第一幕「探测」· 约 30 分钟",
    "场 1 · A 控制室 · 深夜",
    "SH1 大远景 拉远：群山之巅，射电望远镜阵列缓缓转动。（音效：低频嗡鸣起）",
    "SH2 中景 固定：林澈独坐控制台，咖啡杯停在唇边。",
    "SH4 特写 固定：她的手按向红色紧急频道键。（台词：呼叫全球天文台——我是林澈。）",
    "场 2 · 全球新闻碎片 · 白天",
    "SH5 远景/中景 快速横移+手持：各国新闻直播间反复出现同一行字。",
    "◆ 第二幕「解读与分裂」· 约 45 分钟",
    "场 5 · 密码实验室 · 白天",
    "SH14 中景 移动：顾言戴耳机把节拍录入软件。",
    "SH15 近景 推近：顾言摘耳机：这不是语言，是节奏。",
].join("\n");

test("buildScriptBeatsWithActs parses acts, scenes and numbered shots from a structured storyboard", () => {
    const { acts, beats } = buildScriptBeatsWithActs(STRUCTURED_SCRIPT);

    assert.deepEqual(
        acts.map((act) => act.title),
        ["第一幕", "第二幕"],
    );
    assert.equal(acts[0].name, "探测");
    assert.equal(acts[0].duration, "约30分钟");
    assert.deepEqual(
        beats.map((beat) => beat.title),
        ["SH1", "SH2", "SH4", "SH5", "SH14", "SH15"],
    );
});

test("buildScriptBeatsWithActs assigns act, scene heading, shot type, camera and dialogue", () => {
    const { beats } = buildScriptBeatsWithActs(STRUCTURED_SCRIPT);

    assert.equal(beats[0].act, "第一幕");
    assert.equal(beats[0].sceneHeading, "场 1 · A 控制室 · 深夜");
    assert.equal(beats[0].shotType, "大远景");
    assert.equal(beats[0].camera, "拉远");
    assert.ok(beats[0].content.includes("射电望远镜阵列"));

    assert.equal(beats[2].dialogue, "呼叫全球天文台——我是林澈。");
    assert.ok(!beats[2].content.includes("台词"));

    assert.equal(beats[3].shotType, "远景");
    assert.equal(beats[3].camera, "快速横移+手持");
    assert.equal(beats[3].sceneHeading, "场 2 · 全球新闻碎片 · 白天");

    assert.equal(beats[4].act, "第二幕");
    assert.equal(beats[4].sceneHeading, "场 5 · 密码实验室 · 白天");
    assert.equal(beats[5].camera, "推近");
});

test("buildScriptBeats falls back to line splitting when the body has no shot numbers", () => {
    const beats = buildScriptBeats("第一幕：主角进入陌生空间。\n特写：发现关键道具。");

    assert.equal(beats.length, 2);
    assert.equal(beats[0].title, "第一幕");
    assert.equal(beats[0].act, undefined);
});
