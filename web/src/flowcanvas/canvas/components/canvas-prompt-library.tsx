"use client";

import { useState, type ReactNode } from "react";
import { Button, Tooltip } from "antd";
import { BookOpen } from "lucide-react";

import { PromptSelectDialog } from "@/flowcanvas/components/prompts/prompt-select-dialog";
import { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";

export function CanvasPromptLibrary({ onSelect, icon, tooltip = "提示词库" }: { onSelect: (prompt: string) => void; icon?: ReactNode; tooltip?: string }) {
    const [open, setOpen] = useState(false);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <>
            <Tooltip title={tooltip}>
                <Button type="text" className="!h-8 !w-8 !min-w-8 shrink-0 !rounded-full !bg-transparent !p-0" style={{ color: theme.node.text }} icon={icon || <BookOpen className="size-3.5" />} onClick={() => setOpen(true)} aria-label={tooltip} />
            </Tooltip>
            <PromptSelectDialog open={open} onOpenChange={setOpen} onSelect={onSelect} />
        </>
    );
}
