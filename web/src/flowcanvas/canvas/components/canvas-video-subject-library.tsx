"use client";

import { useRef, useState } from "react";
import { App, Modal } from "antd";
import { Check, ImagePlus, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { nanoid } from "nanoid";

import type { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { uploadImageToCurrentBackend } from "@/flowcanvas/services/api/backend";
import { useConfigStore, type CanvasVideoSubject } from "@/flowcanvas/stores/use-config-store";
import { useUserStore } from "@/flowcanvas/stores/use-user-store";
import { createVideoSubject, videoSubjectValidationError } from "../utils/canvas-video-subjects";

type CanvasVideoSubjectLibraryProps = {
    /** 当前选中的主体 id，空串表示不使用主体 */
    value?: string;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onChange?: (subjectId: string) => void;
    /** 管理模式（dock 角色库入口）：不做选择，点击卡片直接编辑 */
    manageOnly?: boolean;
};

type SubjectDraft = {
    id?: string;
    name: string;
    description: string;
    images: string[];
};

const EMPTY_DRAFT: SubjectDraft = { name: "", description: "", images: [] };

/** 视频主体库弹层：选择/新建/编辑/删除账号级视频主体（对齐 LibTV 主体库/角色库）。manageOnly 时作为 dock 角色库的管理面板。 */
export function CanvasVideoSubjectLibrary({ value = "", theme, onChange, manageOnly = false }: CanvasVideoSubjectLibraryProps) {
    const { message } = App.useApp();
    const subjects = useConfigStore((state) => state.config.videoSubjects) || [];
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const [draft, setDraft] = useState<SubjectDraft | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const removeSubject = (subject: CanvasVideoSubject) => {
        updateConfig("videoSubjects", subjects.filter((item) => item.id !== subject.id));
        if (value === subject.id) onChange?.("");
        message.success(`已删除主体「${subject.name}」`);
    };

    const uploadImages = async (files: FileList | null) => {
        if (!files?.length || !draft) return;
        const token = useUserStore.getState().token.trim();
        if (!token) {
            message.warning("请先登录后端账号，再上传主体参考图");
            return;
        }
        setUploading(true);
        try {
            const list = Array.from(files).filter((file) => file.type.startsWith("image/"));
            const urls: string[] = [];
            for (const file of list) urls.push(await uploadImageToCurrentBackend(token, file, file.name));
            if (urls.length) setDraft((current) => (current ? { ...current, images: [...current.images, ...urls] } : current));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "参考图上传失败");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const saveDraft = () => {
        if (!draft) return;
        const error = videoSubjectValidationError(draft);
        if (error) {
            message.warning(error);
            return;
        }
        if (draft.id) {
            updateConfig("videoSubjects", subjects.map((item) => (item.id === draft.id ? { ...item, name: draft.name.trim(), description: draft.description.trim(), images: draft.images.filter(Boolean) } : item)));
            message.success(`已更新主体「${draft.name.trim()}」`);
        } else {
            updateConfig("videoSubjects", [...subjects, createVideoSubject(draft, nanoid(8))]);
            message.success(`已创建主体「${draft.name.trim()}」`);
        }
        setDraft(null);
    };

    return (
        <div className="w-[430px] max-w-[calc(100vw-32px)] p-2" style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <div className="px-1 pb-2 text-sm font-semibold">{manageOnly ? "角色库" : "主体库"}</div>
            <div className="grid max-h-[300px] grid-cols-3 gap-2 overflow-y-auto max-[480px]:grid-cols-2">
                {manageOnly ? null : (
                    <button
                        type="button"
                        className="relative min-h-[86px] overflow-hidden rounded-md border p-2 text-left transition hover:-translate-y-px"
                        style={{ borderColor: !value ? theme.ui.accent : theme.ui.hairline, color: theme.node.text }}
                        onClick={() => onChange?.("")}
                    >
                        <span className="block text-xs font-semibold">不使用主体</span>
                        <span className="mt-1 block text-[10px] leading-4 opacity-65">仅按提示词与连线参考生成</span>
                        {!value ? <Check className="absolute right-2 top-2 size-3.5" /> : null}
                    </button>
                )}
                {subjects.map((subject) => (
                    <button
                        key={subject.id}
                        type="button"
                        className="group relative min-h-[86px] overflow-hidden rounded-md border p-2 text-left transition hover:-translate-y-px"
                        style={{ borderColor: !manageOnly && value === subject.id ? theme.ui.accent : theme.ui.hairline, color: theme.node.text }}
                        onClick={() => (manageOnly ? setDraft({ id: subject.id, name: subject.name, description: subject.description, images: [...subject.images] }) : onChange?.(subject.id))}
                    >
                        {subject.images[0] ? <img src={subject.images[0]} alt="" className="pointer-events-none absolute inset-0 size-full object-cover opacity-25" /> : null}
                        <span className="relative block pr-4 text-xs font-semibold">{subject.name}</span>
                        <span className="relative mt-1 line-clamp-2 block text-[10px] leading-4 opacity-65">{subject.description || `${subject.images.length} 张参考图`}</span>
                        {!manageOnly && value === subject.id ? <Check className="absolute right-2 top-2 size-3.5" /> : null}
                        <span className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
                            <span
                                role="button"
                                aria-label={`编辑主体 ${subject.name}`}
                                className="rounded p-0.5 opacity-70 hover:opacity-100"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setDraft({ id: subject.id, name: subject.name, description: subject.description, images: [...subject.images] });
                                }}
                            >
                                <Pencil className="size-3" />
                            </span>
                            <span
                                role="button"
                                aria-label={`删除主体 ${subject.name}`}
                                className="rounded p-0.5 opacity-70 hover:opacity-100"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    removeSubject(subject);
                                }}
                            >
                                <Trash2 className="size-3" />
                            </span>
                        </span>
                    </button>
                ))}
            </div>
            {!subjects.length ? (
                <div className="px-1 pt-2 text-[10px] leading-4" style={{ color: theme.node.muted }}>
                    还没有主体。新建主体后，视频生成会把主体参考图与描述一并提交，保持角色/商品跨镜头一致。
                </div>
            ) : null}
            <div className="mt-2 border-t px-1 pt-2" style={{ borderColor: theme.ui.hairline }}>
                <button
                    type="button"
                    className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] transition hover:opacity-80"
                    style={{ borderColor: theme.ui.hairline, background: theme.ui.controlFill, color: theme.node.text }}
                    onClick={() => setDraft(EMPTY_DRAFT)}
                >
                    <Plus className="size-3" />
                    新建主体
                </button>
                <div className="pt-1.5 text-[10px] leading-4" style={{ color: theme.node.muted }}>主体保存在账号配置中，可在任意视频节点复用。</div>
            </div>

            <Modal open={Boolean(draft)} centered width={420} footer={null} title={draft?.id ? "编辑主体" : "新建主体"} onCancel={() => setDraft(null)} destroyOnHidden styles={{ body: { background: theme.node.panel, color: theme.node.text } }}>
                {draft ? (
                    <div className="space-y-3 pt-1" style={{ color: theme.node.text }}>
                        <input
                            className="h-8 w-full rounded-md border px-2 text-xs outline-none placeholder:opacity-40"
                            style={{ borderColor: theme.ui.hairline, background: theme.ui.controlFill, color: theme.node.text }}
                            placeholder="主体名称，如：小满 / 品牌咖啡杯"
                            value={draft.name}
                            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                            aria-label="主体名称"
                        />
                        <textarea
                            className="h-20 w-full resize-none rounded-md border px-2 py-1.5 text-xs leading-5 outline-none placeholder:opacity-40"
                            style={{ borderColor: theme.ui.hairline, background: theme.ui.controlFill, color: theme.node.text }}
                            placeholder="主体描述（可选）：外观、服装、标志性特征，生成时会追加进提示词"
                            value={draft.description}
                            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                            aria-label="主体描述"
                        />
                        <div>
                            <div className="flex flex-wrap gap-2">
                                {draft.images.map((url, index) => (
                                    <span key={url} className="relative size-14 overflow-hidden rounded-md border" style={{ borderColor: theme.ui.hairline }}>
                                        <img src={url} alt={`参考图 ${index + 1}`} className="size-full object-cover" />
                                        <span
                                            role="button"
                                            aria-label={`移除参考图 ${index + 1}`}
                                            className="absolute right-0.5 top-0.5 rounded-full p-0.5"
                                            style={{ background: theme.ui.materialElevated, color: theme.node.text }}
                                            onClick={() => setDraft({ ...draft, images: draft.images.filter((_, itemIndex) => itemIndex !== index) })}
                                        >
                                            <X className="size-3" />
                                        </span>
                                    </span>
                                ))}
                                <button
                                    type="button"
                                    className="flex size-14 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-[10px] transition enabled:hover:opacity-80 disabled:opacity-40"
                                    style={{ borderColor: theme.ui.hairline, color: theme.node.muted }}
                                    disabled={uploading}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    {uploading ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                                    {uploading ? "上传中" : "上传"}
                                </button>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                aria-label="上传主体参考图"
                                onChange={(event) => void uploadImages(event.target.files)}
                            />
                            <div className="pt-1.5 text-[10px] leading-4" style={{ color: theme.node.muted }}>参考图上传到账号后端，多角度/多场景图能提升一致性。</div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button type="button" className="h-8 rounded-md border px-3 text-xs transition hover:opacity-80" style={{ borderColor: theme.ui.hairline, color: theme.node.text }} onClick={() => setDraft(null)}>
                                取消
                            </button>
                            <button type="button" className="h-8 rounded-md border px-3 text-xs font-medium transition hover:opacity-80" style={{ borderColor: theme.ui.accent, background: theme.ui.controlFill, color: theme.node.text }} onClick={saveDraft}>
                                {draft.id ? "保存修改" : "创建主体"}
                            </button>
                        </div>
                    </div>
                ) : null}
            </Modal>
        </div>
    );
}
