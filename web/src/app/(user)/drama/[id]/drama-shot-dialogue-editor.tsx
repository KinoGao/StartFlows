"use client";

import { Button, Input, Modal } from "antd";
import { MessageSquareText, PencilLine, Plus, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { useState } from "react";

import type { DramaShot, DramaUtterance } from "../types";
import { useDramaStore } from "../stores/use-drama-store";

const dialogueInputClass = "!shadow-none hover:!border-foreground/25 focus:!border-foreground/35 focus:!shadow-none";

export function DramaShotDialogueEditor({ projectId, episodeId, shot }: { projectId: string; episodeId: string; shot: DramaShot }) {
    const updateShot = useDramaStore((state) => state.updateShot);
    const [editorOpen, setEditorOpen] = useState(false);
    const existingRows = shot.utterances.filter((item) => item.type === "dialogue");
    const rows = existingRows.length
        ? existingRows
        : shot.dialogue
              .split(/\n+/)
              .map((text) => text.trim())
              .filter(Boolean)
              .map((text, index) => ({ id: `dialogue-draft-${index}`, order: index + 1, type: "dialogue" as const, speaker: "", text }));
    const previewRows = rows.slice(0, 2);

    const commit = (nextRows: DramaUtterance[]) => {
        const rowById = new Map(nextRows.map((item) => [item.id, item]));
        const currentIds = new Set(shot.utterances.map((item) => item.id));
        const utterances = shot.utterances.flatMap((item) => (item.type === "dialogue" ? (rowById.has(item.id) ? [rowById.get(item.id)!] : []) : [item]));
        for (const item of nextRows) if (!currentIds.has(item.id)) utterances.push({ ...item, id: `utterance-${nanoid()}` });
        const normalized = utterances.map((item, index) => ({ ...item, order: index + 1 }));
        const dialogue = normalized
            .filter((item) => item.type === "dialogue")
            .map((item) => item.text.trim())
            .filter(Boolean)
            .join("\n");
        updateShot(projectId, episodeId, shot.id, { utterances: normalized, dialogue, subtitle: [dialogue, shot.narration].filter(Boolean).join("\n") });
    };

    const addRow = () => commit([...rows, { id: `utterance-${nanoid()}`, order: rows.length + 1, type: "dialogue", speaker: "", text: "" }]);
    const openEditor = () => {
        setEditorOpen(true);
        if (!rows.length) addRow();
    };

    return (
        <>
            <div className="min-w-0">
                <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <MessageSquareText className="size-3.5 shrink-0" />
                        对白（原话）
                        {rows.length ? <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-normal tabular-nums">{rows.length} 句</span> : null}
                    </span>
                    <Button
                        size="small"
                        className="!h-7 !shrink-0 !rounded-md !border-border/80 !bg-background !px-2 !text-xs !font-medium hover:!border-foreground/30"
                        icon={rows.length ? <PencilLine className="size-3.5" /> : <Plus className="size-3.5" />}
                        onClick={openEditor}
                    >
                        {rows.length ? "编辑对白" : "添加对白"}
                    </Button>
                </div>
                {previewRows.length ? (
                    <button type="button" className="mt-1.5 block min-w-0 w-full rounded-md border-l-2 border-foreground/10 px-2.5 py-1.5 text-left transition hover:bg-muted/25" aria-label="打开对白编辑" onClick={() => setEditorOpen(true)}>
                        <span className="line-clamp-2 min-w-0 text-xs leading-5 text-muted-foreground">
                            {previewRows.map((row, index) => (
                                <span key={row.id}>
                                    {index ? <span className="mx-1 text-foreground/25">·</span> : null}
                                    <span className="font-medium text-foreground/80">{row.speaker.trim() || "未标注"}：</span>
                                    <span>{row.text.trim() || "待填写对白内容"}</span>
                                </span>
                            ))}
                            {rows.length > previewRows.length ? <span className="text-xs text-muted-foreground"> · 还有 {rows.length - previewRows.length} 句</span> : null}
                        </span>
                    </button>
                ) : (
                    <button type="button" className="mt-1 flex h-9 w-full items-center border-y border-border/55 text-left text-xs text-muted-foreground transition hover:bg-muted/35 hover:text-foreground" onClick={openEditor}>
                        暂无对白，点击添加角色原话
                    </button>
                )}
            </div>

            <Modal
                title={
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">对白编辑</div>
                        <div className="mt-0.5 truncate text-xs font-normal text-muted-foreground">{shot.title || `镜头 ${shot.order}`}</div>
                    </div>
                }
                centered
                width="min(680px, calc(100vw - 24px))"
                open={editorOpen}
                destroyOnHidden
                onCancel={() => setEditorOpen(false)}
                footer={
                    <Button onClick={addRow} icon={<Plus className="size-4" />}>
                        添加一句对白
                    </Button>
                }
                styles={{ body: { padding: 0 } }}
            >
                <div className="flex min-h-0 flex-col">
                    <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2.5">
                        <p className="min-w-0 text-xs leading-5 text-muted-foreground">按“说话人 + 原话”逐句核对，长对白只在这里滚动。</p>
                        <span className="shrink-0 text-xs font-medium tabular-nums">{rows.length} 句</span>
                    </div>
                    <div className="max-h-[min(62vh,560px)] overflow-y-auto overscroll-contain px-4">
                        <div className="divide-y divide-border/65">
                            {rows.map((row, index) => (
                                <div key={row.id} className="grid min-w-0 grid-cols-[28px_minmax(0,1fr)_28px] items-start gap-2 py-2.5">
                                    <span className="pt-2 text-center text-[11px] font-medium tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                                    <div className="grid min-w-0 gap-2 sm:grid-cols-[104px_minmax(0,1fr)]">
                                        <Input
                                            className={`${dialogueInputClass} !h-8 !px-2 !text-xs`}
                                            value={row.speaker}
                                            placeholder="说话人"
                                            aria-label={`第 ${index + 1} 句对白的说话人`}
                                            onChange={(event) => commit(rows.map((item) => (item.id === row.id ? { ...item, speaker: event.target.value } : item)))}
                                        />
                                        <Input.TextArea
                                            className={`${dialogueInputClass} !min-w-0 !text-sm`}
                                            value={row.text}
                                            autoSize={{ minRows: 1, maxRows: 4 }}
                                            placeholder="角色实际说出的原话"
                                            aria-label={`第 ${index + 1} 句对白内容`}
                                            onChange={(event) => commit(rows.map((item) => (item.id === row.id ? { ...item, text: event.target.value } : item)))}
                                        />
                                    </div>
                                    <Button
                                        type="text"
                                        className="!size-7 !p-0 !text-muted-foreground hover:!bg-muted hover:!text-foreground"
                                        icon={<Trash2 className="size-3.5" />}
                                        aria-label={`删除第 ${index + 1} 句对白`}
                                        onClick={() => commit(rows.filter((item) => item.id !== row.id))}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </Modal>
        </>
    );
}
