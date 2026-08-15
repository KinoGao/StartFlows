import assert from "node:assert/strict";
import { test } from "vitest";

import { VIDEO_TRIM_MIN_SECONDS } from "./canvas-video-tools";
import {
    adjustClipOutPoint,
    clipEffectiveDuration,
    createTimelineClip,
    isTimelineEditableTarget,
    layoutTimeline,
    locateTimelineTime,
    moveTimelineClip,
    removeTimelineClip,
    resolveTimelineShortcut,
    setClipPointFromPlayhead,
    TIMELINE_LENGTH_FINE_STEP_SECONDS,
    TIMELINE_LENGTH_STEP_SECONDS,
    TIMELINE_SEEK_STEP_SECONDS,
    updateClipRange,
    withClipDuration,
    type TimelineClip,
} from "./canvas-video-timeline";

function makeClip(id: string, duration = 10, kind: "video" | "audio" = "video"): TimelineClip {
    return withClipDuration(createTimelineClip({ id, kind, title: `片段${id}`, src: `blob:${id}` }), duration);
}

test("withClipDuration 默认选取完整区间，时长过短时保持不可用", () => {
    const clip = withClipDuration(createTimelineClip({ id: "a", kind: "video", title: "a", src: "blob:a" }), 6.5);
    assert.equal(clip.duration, 6.5);
    assert.equal(clip.inPoint, 0);
    assert.equal(clip.outPoint, 6.5);

    const tooShort = withClipDuration(createTimelineClip({ id: "b", kind: "video", title: "b", src: "blob:b" }), 0.05);
    assert.equal(tooShort.duration, 0);
    assert.equal(clipEffectiveDuration(tooShort), 0);

    const invalid = withClipDuration(createTimelineClip({ id: "c", kind: "video", title: "c", src: "blob:c" }), Number.NaN);
    assert.equal(invalid.duration, 0);
});

test("layoutTimeline 顺序排列片段并计算总时长", () => {
    const a = { ...makeClip("a", 10), inPoint: 2, outPoint: 5 };
    const b = makeClip("b", 4);
    const layout = layoutTimeline([a, b]);
    assert.equal(layout.items[0].start, 0);
    assert.equal(layout.items[0].end, 3);
    assert.equal(layout.items[1].start, 3);
    assert.equal(layout.items[1].end, 7);
    assert.equal(layout.totalDuration, 7);
    assert.equal(layoutTimeline([]).totalDuration, 0);
});

test("updateClipRange 校验区间，无效时返回原片段", () => {
    const clip = makeClip("a", 10);
    const updated = updateClipRange(clip, 2, 8);
    assert.equal(updated.inPoint, 2);
    assert.equal(updated.outPoint, 8);
    // 夹取到素材时长内
    const clamped = updateClipRange(clip, -3, 99);
    assert.equal(clamped.inPoint, 0);
    assert.equal(clamped.outPoint, 10);
    // 时长为 0（元数据未加载）时区间无效
    const empty = createTimelineClip({ id: "x", kind: "video", title: "x", src: "blob:x" });
    assert.equal(updateClipRange(empty, 0, 1), empty);
});

test("adjustClipOutPoint 按步长调整出点并保持最小时长", () => {
    const clip = makeClip("a", 10);
    assert.equal(adjustClipOutPoint(clip, TIMELINE_LENGTH_STEP_SECONDS).outPoint, 10); // 已到素材末尾
    const trimmed = updateClipRange(clip, 2, 5);
    assert.equal(adjustClipOutPoint(trimmed, TIMELINE_LENGTH_STEP_SECONDS).outPoint, 5.1);
    assert.equal(adjustClipOutPoint(trimmed, TIMELINE_LENGTH_FINE_STEP_SECONDS).outPoint, 5.01);
    // 缩到最小时长后不再继续缩短
    let current = trimmed;
    for (let index = 0; index < 100; index += 1) current = adjustClipOutPoint(current, -TIMELINE_LENGTH_STEP_SECONDS);
    assert.ok(Math.abs(current.outPoint - current.inPoint - VIDEO_TRIM_MIN_SECONDS) < 1e-9);
});

test("setClipPointFromPlayhead 把播放头位置写为入点/出点", () => {
    const clip = makeClip("a", 10);
    const layout = layoutTimeline([clip]);
    const markedIn = setClipPointFromPlayhead(clip, layout.items[0].start, 3, "in");
    assert.equal(markedIn.inPoint, 3);
    assert.equal(markedIn.outPoint, 10);
    // 入点移到 3 后，播放头 4 对应素材本地时间 3 + 4 = 7
    const markedOut = setClipPointFromPlayhead(markedIn, layout.items[0].start, 4, "out");
    assert.equal(markedOut.inPoint, 3);
    assert.equal(markedOut.outPoint, 7);
    // 出点早于入点时自动交换并保证最小时长
    const swapped = setClipPointFromPlayhead(clip, layout.items[0].start, 9.98, "in");
    assert.ok(swapped.outPoint - swapped.inPoint >= VIDEO_TRIM_MIN_SECONDS);
});

test("moveTimelineClip 拖拽排序，非法 id 原样返回", () => {
    const clips = [makeClip("a"), makeClip("b"), makeClip("c")];
    assert.deepEqual(moveTimelineClip(clips, "a", 2).map((clip) => clip.id), ["b", "c", "a"]);
    assert.deepEqual(moveTimelineClip(clips, "c", 0).map((clip) => clip.id), ["c", "a", "b"]);
    assert.equal(moveTimelineClip(clips, "missing", 1), clips);
    assert.deepEqual(moveTimelineClip(clips, "b", 99).map((clip) => clip.id), ["a", "c", "b"]);
});

test("removeTimelineClip 删除指定片段", () => {
    const clips = [makeClip("a"), makeClip("b")];
    assert.deepEqual(removeTimelineClip(clips, "a").map((clip) => clip.id), ["b"]);
    assert.equal(removeTimelineClip(clips, "missing").length, 2);
});

test("locateTimelineTime 把全局时间映射到片段本地时间", () => {
    const a = { ...makeClip("a", 10), inPoint: 2, outPoint: 6 };
    const b = { ...makeClip("b", 10), inPoint: 1, outPoint: 5 };
    const layout = layoutTimeline([a, b]);
    assert.deepEqual(locateTimelineTime(layout, 1), { item: layout.items[0], sourceTime: 3 });
    assert.deepEqual(locateTimelineTime(layout, 4.5), { item: layout.items[1], sourceTime: 1.5 });
    // 结尾夹取到最后一个片段的出点
    assert.deepEqual(locateTimelineTime(layout, 8), { item: layout.items[1], sourceTime: 5 });
    assert.equal(locateTimelineTime(layout, -1), null);
    assert.equal(locateTimelineTime(layout, 9), null);
    assert.equal(locateTimelineTime(layoutTimeline([]), 0), null);
});

test("resolveTimelineShortcut 映射播放/删除/出入点/方向键快捷键", () => {
    assert.deepEqual(resolveTimelineShortcut({ key: " " }), { type: "toggle-play" });
    assert.deepEqual(resolveTimelineShortcut({ key: "Delete" }), { type: "delete-selected" });
    assert.deepEqual(resolveTimelineShortcut({ key: "Backspace" }), { type: "delete-selected" });
    assert.deepEqual(resolveTimelineShortcut({ key: "i" }), { type: "mark", point: "in" });
    assert.deepEqual(resolveTimelineShortcut({ key: "O" }), { type: "mark", point: "out" });
    assert.deepEqual(resolveTimelineShortcut({ key: "ArrowLeft" }), { type: "seek", deltaSeconds: -TIMELINE_SEEK_STEP_SECONDS });
    assert.deepEqual(resolveTimelineShortcut({ key: "ArrowRight" }), { type: "seek", deltaSeconds: TIMELINE_SEEK_STEP_SECONDS });
    assert.deepEqual(resolveTimelineShortcut({ key: "ArrowUp" }), { type: "adjust-length", deltaSeconds: TIMELINE_LENGTH_STEP_SECONDS });
    assert.deepEqual(resolveTimelineShortcut({ key: "ArrowDown" }), { type: "adjust-length", deltaSeconds: -TIMELINE_LENGTH_STEP_SECONDS });
    assert.deepEqual(resolveTimelineShortcut({ key: "ArrowUp", shiftKey: true }), { type: "adjust-length", deltaSeconds: TIMELINE_LENGTH_FINE_STEP_SECONDS });
    assert.deepEqual(resolveTimelineShortcut({ key: "ArrowDown", shiftKey: true }), { type: "adjust-length", deltaSeconds: -TIMELINE_LENGTH_FINE_STEP_SECONDS });
    // 系统组合键与未映射按键放行
    assert.equal(resolveTimelineShortcut({ key: "ArrowUp", ctrlKey: true }), null);
    assert.equal(resolveTimelineShortcut({ key: " ", metaKey: true }), null);
    assert.equal(resolveTimelineShortcut({ key: "Enter" }), null);
});

test("isTimelineEditableTarget 输入控件与滑杆聚焦时不劫持按键", () => {
    assert.equal(isTimelineEditableTarget(null), false);
    assert.equal(isTimelineEditableTarget({}), false);
    assert.equal(isTimelineEditableTarget({ tagName: "DIV" }), false);
    assert.equal(isTimelineEditableTarget({ tagName: "INPUT" }), true);
    assert.equal(isTimelineEditableTarget({ tagName: "textarea" }), true);
    assert.equal(isTimelineEditableTarget({ tagName: "SELECT" }), true);
    assert.equal(isTimelineEditableTarget({ tagName: "DIV", isContentEditable: true }), true);
    assert.equal(isTimelineEditableTarget({ tagName: "DIV", getAttribute: (name) => (name === "role" ? "slider" : null) }), true);
});
