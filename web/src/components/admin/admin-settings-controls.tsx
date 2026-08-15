import type { ReactNode } from "react";
import { Switch } from "antd";

export function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
    return (
        <div className="flex items-center gap-2 text-sm font-semibold text-stone-950 dark:text-stone-100">
            <span className="admin-section-title-icon flex size-7 items-center justify-center rounded-md bg-white text-stone-700 ring-1 ring-stone-200 dark:bg-stone-950 dark:text-stone-200 dark:ring-stone-800">{icon}</span>
            <span>{title}</span>
        </div>
    );
}

export function LabeledControl({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-medium text-stone-500 dark:text-stone-400">{label}</span>
            {children}
        </label>
    );
}

export function SettingToggle({
    title,
    description,
    checked,
    checkedChildren,
    unCheckedChildren,
    onChange,
}: {
    title: string;
    description: string;
    checked: boolean;
    checkedChildren: string;
    unCheckedChildren: string;
    onChange: (checked: boolean) => void;
}) {
    return (
        <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
                <div className="text-sm font-medium text-stone-950 dark:text-stone-100">{title}</div>
                <div className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">{description}</div>
            </div>
            <Switch className="shrink-0" checked={checked} checkedChildren={checkedChildren} unCheckedChildren={unCheckedChildren} onChange={onChange} />
        </div>
    );
}

export function SettingInlineToggle({ title, checked, checkedChildren, unCheckedChildren, onChange }: { title: string; checked: boolean; checkedChildren: string; unCheckedChildren: string; onChange: (checked: boolean) => void }) {
    return (
        <div className="flex w-full items-center justify-between gap-4 rounded-md bg-white px-4 py-2.5 ring-1 ring-stone-200 xl:w-auto dark:bg-stone-950 dark:ring-stone-800">
            <div className="text-sm font-medium text-stone-950 dark:text-stone-100">{title}</div>
            <Switch className="shrink-0" checked={checked} checkedChildren={checkedChildren} unCheckedChildren={unCheckedChildren} onChange={onChange} />
        </div>
    );
}
