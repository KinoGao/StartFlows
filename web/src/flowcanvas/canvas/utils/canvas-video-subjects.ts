import type { CanvasVideoSubject } from "@/flowcanvas/stores/use-config-store";
import type { ReferenceImage } from "@/flowcanvas/types/image";

/**
 * 视频主体库（对齐 LibTV 主体库）：账号级可复用主体 = 名称 + 描述 + 多张参考图。
 * 视频节点在 metadata.videoSubjectId 记录选中的主体，生成时把主体参考图集并入参考图、
 * 把主体描述追加进提示词，实现角色/商品跨镜头一致性。
 */

/** 按 id 解析主体；空 id 或未知 id 返回 null */
export function resolveVideoSubject(subjects: CanvasVideoSubject[] | undefined, subjectId: string | undefined): CanvasVideoSubject | null {
    if (!subjectId) return null;
    return (subjects || []).find((subject) => subject.id === subjectId) || null;
}

/** 主体对应的提示词片段：名称 + 描述 + 一致性约束 */
export function videoSubjectPromptSegment(subject: CanvasVideoSubject): string {
    const name = subject.name.trim();
    const description = subject.description.trim();
    const parts = [`保持主体「${name}」与参考图外观一致`];
    if (description) parts.push(`主体描述：${description}`);
    return parts.join("，");
}

/** 把主体片段追加到视频提示词末尾（沿用风格/运镜的「, 」拼接方式） */
export function buildVideoSubjectPrompt(prompt: string, subject: CanvasVideoSubject | null): string {
    if (!subject) return prompt;
    return [prompt, videoSubjectPromptSegment(subject)].filter(Boolean).join(", ");
}

/** 主体参考图集转换为视频生成管线的参考图（仅含后端可访问 URL） */
export function videoSubjectReferenceImages(subject: CanvasVideoSubject): ReferenceImage[] {
    return subject.images.filter((url) => url.trim()).map((url, index) => ({
        id: `${subject.id}-${index}`,
        name: `${subject.name || "subject"}-${index + 1}.png`,
        type: "image/png",
        dataUrl: "",
        url,
    }));
}

/** 新建主体记录（参考图需先上传到后端，至少一张） */
export function createVideoSubject(input: { name: string; description?: string; images: string[] }, id: string, now = new Date()): CanvasVideoSubject {
    return {
        id,
        name: input.name.trim(),
        description: (input.description || "").trim(),
        images: input.images.map((url) => url.trim()).filter(Boolean),
        createdAt: now.toISOString(),
    };
}

/** 校验主体是否可保存：需要名称和至少一张参考图 */
export function videoSubjectValidationError(subject: Pick<CanvasVideoSubject, "name" | "images">): string {
    if (!subject.name.trim()) return "请填写主体名称";
    if (!subject.images.filter((url) => url.trim()).length) return "请至少上传一张参考图";
    return "";
}
