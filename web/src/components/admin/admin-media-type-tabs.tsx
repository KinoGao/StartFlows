"use client";

import { Tabs } from "antd";
import { FileAudio, Film, Files, Image as ImageIcon, Paperclip } from "lucide-react";

import { managedMediaTypeOptions } from "@/lib/media-management-contract";

export function AdminMediaTypeTabs({ value, disabled, onChange }: { value: string; disabled?: boolean; onChange: (value: string) => void }) {
    return (
        <Tabs
            activeKey={value || "all"}
            animated={false}
            size="small"
            tabBarGutter={24}
            items={managedMediaTypeOptions.map((option) => ({
                key: option.value || "all",
                disabled,
                label: (
                    <span className="inline-flex items-center gap-1.5">
                        <MediaTypeIcon value={option.value} />
                        {option.label}
                    </span>
                ),
            }))}
            className="[&_.ant-tabs-nav]:!mb-3 [&_.ant-tabs-tab]:!py-2 [&_.ant-tabs-tab-btn]:!shadow-none"
            onChange={(key) => onChange(key === "all" ? "" : key)}
        />
    );
}

function MediaTypeIcon({ value }: { value: string }) {
    if (value === "image") return <ImageIcon className="size-4" />;
    if (value === "video") return <Film className="size-4" />;
    if (value === "audio") return <FileAudio className="size-4" />;
    if (value === "attachment") return <Paperclip className="size-4" />;
    return <Files className="size-4" />;
}
