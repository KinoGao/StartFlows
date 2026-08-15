"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Button, Tooltip } from "antd";
import { BookOpen } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { preloadOnIdle } from "@/lib/preload-on-idle";
import { useThemeStore } from "@/stores/use-theme-store";

const loadPromptSelectDialog = () => import("@/components/prompts/prompt-select-dialog").then((module) => module.PromptSelectDialog);
const PromptSelectDialog = dynamic(loadPromptSelectDialog, { ssr: false, loading: () => null });

export function CanvasPromptLibrary({ onSelect }: { onSelect: (prompt: string) => void }) {
    const [open, setOpen] = useState(false);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    useEffect(() => {
        return preloadOnIdle(() => {
            void loadPromptSelectDialog();
        });
    }, []);

    return (
        <>
            <Tooltip title="提示词库">
                <Button type="text" className="!h-8 !w-8 !min-w-8 shrink-0 !rounded-full !bg-transparent !p-0" style={{ color: theme.node.text }} icon={<BookOpen className="size-3.5" />} onClick={() => setOpen(true)} aria-label="提示词库" />
            </Tooltip>
            {open ? <PromptSelectDialog open={open} onOpenChange={setOpen} onSelect={onSelect} /> : null}
        </>
    );
}
