"use client";

import { useEffect, useId, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { Cpu } from "lucide-react";
import { Select } from "antd";

import { cn } from "@/flowcanvas/lib/utils";
import { modelOptionLabel, modelOptionName, selectableModelsByCapability, type AiConfig, type ModelCapability } from "@/flowcanvas/stores/use-config-store";

type ModelPickerProps = {
    config: AiConfig;
    value?: string;
    onChange: (model: string) => void;
    capability?: ModelCapability;
    className?: string;
    fullWidth?: boolean;
    placeholder?: string;
    onMissingConfig?: () => void;
};

export function ModelPicker({ config, value, onChange, capability, className, fullWidth = false, placeholder = "选择模型", onMissingConfig }: ModelPickerProps) {
    const pickerId = useId();
    const [open, setOpen] = useState(false);
    const options = useMemo(() => Array.from(new Set([value, ...selectableModelsByCapability(config, capability)].filter((model): model is string => Boolean(model)))), [capability, config, value]);
    const current = value || "";
    const selectValue = current && options.includes(current) ? current : "";
    const selectOptions: Array<{ value: string; label: ReactNode; title?: string; disabled?: boolean }> = options.length
        ? options.map((model) => ({ value: model, label: <ModelLabel config={config} model={model} />, title: modelOptionLabel(config, model) }))
        : [{ value: "__empty__", label: emptyModelLabel(config, capability), disabled: true }];

    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId]);

    return (
        <Select
            open={open}
            value={selectValue || undefined}
            placeholder={
                <span className="inline-flex min-w-0 items-center gap-2">
                    <ModelIcon model="" />
                    <span className="truncate">{placeholder}</span>
                </span>
            }
            options={selectOptions}
            popupMatchSelectWidth={false}
            placement="bottomLeft"
            className={cn(
                "canvas-composer-model-picker h-8 max-w-full",
                fullWidth ? "w-full min-w-0" : "w-fit min-w-[9rem]",
                className,
            )}
            popupRender={(menu) => (
                <div data-canvas-no-zoom className="canvas-no-zoom-popup w-80 max-w-[calc(100vw-24px)]" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                    {menu}
                </div>
            )}
            title={current ? modelOptionLabel(config, current) : placeholder}
            onOpenChange={(nextOpen) => {
                if (nextOpen && !options.length && config.channelMode === "local") onMissingConfig?.();
                if (nextOpen) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
                setOpen(nextOpen);
            }}
            onChange={(next) => {
                if (next && next !== "__empty__") onChange(next);
            }}
            onMouseDown={(event: ReactMouseEvent) => event.stopPropagation()}
        />
    );
}

function emptyModelLabel(config: AiConfig, capability?: ModelCapability) {
    const label = capability === "image" ? "生图" : capability === "video" ? "视频" : capability === "text" ? "文本" : capability === "audio" ? "音频" : "";
    if (capability && config.models.length) return "请先在上方配置可选模型";
    return config.models.length ? `暂无匹配的${label}模型` : "请先到配置里添加渠道和模型";
}

function ModelLabel({ config, model }: { config: AiConfig; model: string }) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            <ModelIcon model={model} />
            <span className="truncate">{modelOptionLabel(config, model)}</span>
        </span>
    );
}

function ModelIcon({ model }: { model: string }) {
    const icon = resolveModelIcon(modelOptionName(model));
    return icon ? <img src={icon} alt="" className="size-4 shrink-0 dark:invert" /> : <Cpu className="size-4 shrink-0 opacity-70" />;
}

function resolveModelIcon(model: string) {
    const name = model.toLowerCase();
    if (name.includes("claude") || name.includes("anthropic")) return "/icons/claude.svg";
    if (name.includes("gemini") || name.includes("google")) return "/icons/gemini.svg";
    if (name.includes("gpt") || name.includes("openai")) return "/icons/openai.svg";
    if (name.includes("grok") || name.includes("grok")) return "/icons/grok.svg";
    if (name.includes("deepseek") || name.includes("deepseek")) return "/icons/deepseek.svg";
    if (name.includes("glm") || name.includes("glm")) return "/icons/glm.svg";
    return "";
}
