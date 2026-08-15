import assert from "node:assert/strict";
import { test } from "vitest";

import type { CanvasVideoSubject } from "@/flowcanvas/stores/use-config-store";

import {
    buildVideoSubjectPrompt,
    createVideoSubject,
    resolveVideoSubject,
    videoSubjectPromptSegment,
    videoSubjectReferenceImages,
    videoSubjectValidationError,
} from "./canvas-video-subjects";

const SUBJECTS: CanvasVideoSubject[] = [
    { id: "s1", name: "小满", description: "短发女生，红色外套", images: ["https://cdn.example.com/a.png", "https://cdn.example.com/b.png"], createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "s2", name: "咖啡杯", description: "", images: ["https://cdn.example.com/cup.png"], createdAt: "2026-01-02T00:00:00.000Z" },
];

test("resolveVideoSubject 按 id 找到主体，空或未知 id 返回 null", () => {
    assert.equal(resolveVideoSubject(SUBJECTS, "s1")?.name, "小满");
    assert.equal(resolveVideoSubject(SUBJECTS, ""), null);
    assert.equal(resolveVideoSubject(SUBJECTS, undefined), null);
    assert.equal(resolveVideoSubject(SUBJECTS, "missing"), null);
    assert.equal(resolveVideoSubject(undefined, "s1"), null);
});

test("videoSubjectPromptSegment 拼名称与描述，描述为空时省略", () => {
    assert.equal(videoSubjectPromptSegment(SUBJECTS[0]), "保持主体「小满」与参考图外观一致，主体描述：短发女生，红色外套");
    assert.equal(videoSubjectPromptSegment(SUBJECTS[1]), "保持主体「咖啡杯」与参考图外观一致");
});

test("buildVideoSubjectPrompt 追加主体片段，无主体时原样返回", () => {
    assert.equal(buildVideoSubjectPrompt("女孩走进教室", SUBJECTS[0]), "女孩走进教室, 保持主体「小满」与参考图外观一致，主体描述：短发女生，红色外套");
    assert.equal(buildVideoSubjectPrompt("女孩走进教室", null), "女孩走进教室");
});

test("videoSubjectReferenceImages 把主体图集转成参考图并过滤空 URL", () => {
    const images = videoSubjectReferenceImages({ ...SUBJECTS[0], images: ["https://cdn.example.com/a.png", "", "https://cdn.example.com/b.png"] });
    assert.equal(images.length, 2);
    assert.deepEqual(images[0], {
        id: "s1-0",
        name: "小满-1.png",
        type: "image/png",
        dataUrl: "",
        url: "https://cdn.example.com/a.png",
    });
});

test("createVideoSubject 裁剪空白并过滤空图，记录创建时间", () => {
    const subject = createVideoSubject({ name: " 小满 ", description: " 红外套 ", images: ["u1", " "] }, "id-1", new Date("2026-02-01T00:00:00.000Z"));
    assert.deepEqual(subject, { id: "id-1", name: "小满", description: "红外套", images: ["u1"], createdAt: "2026-02-01T00:00:00.000Z" });
});

test("videoSubjectValidationError 校验名称与参考图", () => {
    assert.equal(videoSubjectValidationError({ name: " ", images: ["u1"] }), "请填写主体名称");
    assert.equal(videoSubjectValidationError({ name: "小满", images: [] }), "请至少上传一张参考图");
    assert.equal(videoSubjectValidationError({ name: "小满", images: ["u1"] }), "");
});
