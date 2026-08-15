import assert from "node:assert/strict";
import { test } from "vitest";

import {
    buildVideoStoryboardBody,
    buildVideoStoryboardPrompt,
    formatTrimTime,
    normalizeVideoTrimRange,
    parseVideoStoryboardResponse,
    pickTrimRecorderMimeType,
    planVideoFrameTimes,
} from "./canvas-video-tools";

test("planVideoFrameTimes 短视频按 2 秒间隔取帧中点", () => {
    assert.deepEqual(planVideoFrameTimes(6), [1, 3, 5]);
    assert.deepEqual(planVideoFrameTimes(1), [0.5]);
});

test("planVideoFrameTimes 长视频等距铺满到上限且不贴尾帧", () => {
    const times = planVideoFrameTimes(60);
    assert.equal(times.length, 10);
    assert.equal(times[0], 3);
    assert.equal(times.at(-1), 57);
    for (const time of times) {
        assert.ok(time > 0 && time < 60);
    }
});

test("planVideoFrameTimes 非法时长返回空数组", () => {
    assert.deepEqual(planVideoFrameTimes(0), []);
    assert.deepEqual(planVideoFrameTimes(Number.NaN), []);
    assert.deepEqual(planVideoFrameTimes(-5), []);
});

test("buildVideoStoryboardPrompt 包含帧数、时长与 JSON 输出要求", () => {
    const prompt = buildVideoStoryboardPrompt(
        [
            { time: 1, dataUrl: "data:image/jpeg;base64,a" },
            { time: 3, dataUrl: "data:image/jpeg;base64,b" },
        ],
        6,
    );
    assert.match(prompt, /2 张图片/);
    assert.match(prompt, /6\.0 秒/);
    assert.match(prompt, /第 2 帧 ≈ 3\.0s/);
    assert.match(prompt, /JSON 数组/);
});

test("parseVideoStoryboardResponse 解析标准 JSON 数组", () => {
    const beats = parseVideoStoryboardResponse('[{"title":"开场","shotType":"远景","duration":"4s","content":"主角走进教室"}]');
    assert.equal(beats.length, 1);
    assert.deepEqual(beats[0], {
        id: "beat-1",
        title: "开场",
        content: "主角走进教室",
        shotType: "远景",
        duration: "4s",
        prompt: "根据脚本分镜生成画面：主角走进教室。要求画面有清晰主体、镜头景别、动作和氛围，电影感构图。",
    });
});

test("parseVideoStoryboardResponse 容忍代码围栏与前后说明文字", () => {
    const text = '好的，分镜如下：\n```json\n[{"title":"追逐","duration":5,"content":"街头追逐"}]\n```\n以上。';
    const beats = parseVideoStoryboardResponse(text);
    assert.equal(beats.length, 1);
    assert.equal(beats[0].title, "追逐");
    assert.equal(beats[0].duration, "5s");
    assert.equal(beats[0].shotType, undefined);
});

test("parseVideoStoryboardResponse 缺字段时回退标题与时长", () => {
    const beats = parseVideoStoryboardResponse('[{"content":"雨夜霓虹街道"},{"title":"空镜"}]');
    assert.equal(beats[0].title, "雨夜霓虹街道");
    assert.equal(beats[0].duration, undefined);
    assert.equal(beats[1].content, "空镜");
});

test("parseVideoStoryboardResponse 非 JSON 或空数组返回空", () => {
    assert.deepEqual(parseVideoStoryboardResponse("无法解析这段视频"), []);
    assert.deepEqual(parseVideoStoryboardResponse("[]"), []);
    assert.deepEqual(parseVideoStoryboardResponse('{"a":1}'), []);
});

test("buildVideoStoryboardBody 生成「标题：内容」逐行正文", () => {
    const body = buildVideoStoryboardBody(parseVideoStoryboardResponse('[{"title":"开场","content":"主角走进教室"},{"title":"高潮","content":"激烈争吵"}]'));
    assert.equal(body, "开场：主角走进教室\n高潮：激烈争吵");
});

test("normalizeVideoTrimRange 交换倒置区间并按最短时长补齐", () => {
    assert.deepEqual(normalizeVideoTrimRange(2, 5, 10), { start: 2, end: 5 });
    assert.deepEqual(normalizeVideoTrimRange(5, 2, 10), { start: 2, end: 5 });
    assert.deepEqual(normalizeVideoTrimRange(3, 3, 10), { start: 3, end: 3.2 });
});

test("normalizeVideoTrimRange 超界收敛与无效输入", () => {
    assert.deepEqual(normalizeVideoTrimRange(-1, 99, 8), { start: 0, end: 8 });
    assert.equal(normalizeVideoTrimRange(8, 8.1, 8), null);
    assert.equal(normalizeVideoTrimRange(0, 1, 0), null);
    assert.equal(normalizeVideoTrimRange(0, 1, Number.NaN), null);
});

test("pickTrimRecorderMimeType 选择首个支持的格式", () => {
    assert.equal(pickTrimRecorderMimeType((type) => type === "video/webm"), "video/webm");
    assert.equal(pickTrimRecorderMimeType(() => false), "");
    assert.equal(pickTrimRecorderMimeType(() => true), "video/mp4");
});

test("formatTrimTime 输出 分:秒.毫秒", () => {
    assert.equal(formatTrimTime(65.25), "1:05.3");
    assert.equal(formatTrimTime(0), "0:00.0");
    assert.equal(formatTrimTime(Number.NaN), "0:00.0");
});
