"use client";

import { Input } from "antd";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { useDramaStore } from "../stores/use-drama-store";
import type { DramaShot, DramaShotContinuity } from "../types";

export function DramaShotContinuityEditor({ projectId, episodeId, shot }: { projectId: string; episodeId: string; shot: DramaShot }) {
    const updateShot = useDramaStore((state) => state.updateShot);
    const [open, setOpen] = useState(false);
    const continuity = { ...emptyContinuity, ...shot.continuity };
    const updateContinuity = (key: keyof DramaShotContinuity, value: string) => updateShot(projectId, episodeId, shot.id, { continuity: { ...continuity, [key]: value } });
    const panelId = `shot-continuity-${shot.id}`;

    return (
        <div className="mt-5 border-t border-border/70 pt-4">
            <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                className={`group grid min-h-12 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-lg border px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${open ? "border-foreground/25 bg-muted/25" : "border-border/70 bg-background hover:border-foreground/20 hover:bg-muted/25"}`}
                onClick={() => setOpen((value) => !value)}
            >
                <span className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-foreground transition-colors group-hover:bg-muted/80">
                        <SlidersHorizontal className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-col justify-center gap-0.5 overflow-hidden">
                        <span className="truncate text-base font-semibold text-foreground">连续性控制</span>
                        <span className="truncate text-xs text-muted-foreground">站位、视线、轴线与动作衔接</span>
                    </span>
                </span>
                <span
                    className={`flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors ${open ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground group-hover:border-foreground/30 group-hover:bg-muted/70"}`}
                >
                    <span>{open ? "收起" : "设置连续性"}</span>
                    <ChevronDown className={`size-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                </span>
            </button>
            {open ? (
                <div id={panelId} className="mt-2 grid gap-3 rounded-md bg-muted/20 p-3 sm:grid-cols-2">
                    <ContinuityInput label="景别" value={continuity.shotSize} placeholder="特写 / 近景 / 中景 / 全景" onChange={(value) => updateContinuity("shotSize", value)} />
                    <ContinuityInput label="机位与角度" value={continuity.cameraAngle} placeholder="平视、俯拍、侧后方" onChange={(value) => updateContinuity("cameraAngle", value)} />
                    <ContinuityInput label="构图" value={continuity.composition} placeholder="主体位于画面左侧，门口留出视线空间" onChange={(value) => updateContinuity("composition", value)} />
                    <ContinuityInput label="人物站位" value={continuity.characterBlocking} placeholder="女主在前景右侧，男主位于门边" onChange={(value) => updateContinuity("characterBlocking", value)} />
                    <ContinuityInput label="视线与屏幕方向" value={continuity.gazeDirection} placeholder="女主看向画面左侧，保持向右运动" onChange={(value) => updateContinuity("gazeDirection", value)} />
                    <ContinuityInput label="轴线规则" value={continuity.axisRule} placeholder="保持人物连线同侧，不越轴" onChange={(value) => updateContinuity("axisRule", value)} />
                    <ContinuityTextArea label="动作起始状态" value={continuity.actionStart} placeholder="镜头开始时人物正在做什么" onChange={(value) => updateContinuity("actionStart", value)} />
                    <ContinuityTextArea label="动作结束状态" value={continuity.actionEnd} placeholder="镜头结束时动作停在哪里，为下一镜头留下什么状态" onChange={(value) => updateContinuity("actionEnd", value)} />
                    <ContinuityTextArea label="相邻镜头备注" value={continuity.continuityNotes} placeholder="与上一镜头或下一镜头必须保持的细节" onChange={(value) => updateContinuity("continuityNotes", value)} />
                </div>
            ) : null}
        </div>
    );
}

function ContinuityInput({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
    return (
        <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
        </label>
    );
}

function ContinuityTextArea({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
    return (
        <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <Input.TextArea value={value} onChange={(event) => onChange(event.target.value)} autoSize={{ minRows: 1, maxRows: 3 }} placeholder={placeholder} />
        </label>
    );
}

const emptyContinuity: DramaShotContinuity = {
    shotSize: "",
    cameraAngle: "",
    composition: "",
    characterBlocking: "",
    gazeDirection: "",
    actionStart: "",
    actionEnd: "",
    screenDirection: "",
    axisRule: "",
    continuityNotes: "",
};
