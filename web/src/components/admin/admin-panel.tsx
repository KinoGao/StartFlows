import type { ReactNode } from "react";

export function Panel({ children }: { children: ReactNode }) {
    return <section className="admin-panel-surface min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">{children}</section>;
}

export function PanelHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
    return (
        <div className="admin-panel-header grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 border-b border-zinc-200 px-3 py-3 sm:flex sm:flex-col sm:gap-3 sm:px-5 sm:py-4 lg:flex-row lg:items-center lg:justify-between dark:border-zinc-800">
            <div className="contents sm:block sm:min-w-0">
                <h2 className="min-w-0 truncate text-sm font-semibold text-zinc-950 sm:text-[15px] dark:text-zinc-100">{title}</h2>
                <div className="col-span-2 line-clamp-2 text-[11px] leading-[18px] text-zinc-500 sm:mt-1 sm:block sm:text-xs sm:leading-5 dark:text-zinc-400">{description}</div>
            </div>
            {actions ? <div className="admin-panel-actions col-start-2 row-start-1 flex max-w-[58vw] min-w-0 flex-wrap items-center justify-end gap-1.5 sm:w-auto sm:max-w-none sm:gap-2 lg:max-w-[58%]">{actions}</div> : null}
        </div>
    );
}

const metricToneClass = {
    slate: "text-zinc-400 dark:text-zinc-500",
    blue: "text-blue-600 dark:text-blue-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    cyan: "text-cyan-600 dark:text-cyan-400",
};

export function Metric({ label, value, detail, icon, tone }: { label: string; value: number | string; detail: string; icon: ReactNode; tone: keyof typeof metricToneClass }) {
    return (
        <div className="admin-metric-card flex min-h-[78px] items-start justify-between gap-2 bg-white p-2.5 dark:bg-zinc-950 sm:min-h-28 sm:gap-4 sm:p-5">
            <div className="min-w-0">
                <div className="text-[10px] font-medium text-zinc-500 sm:text-xs dark:text-zinc-400">{label}</div>
                <div className="mt-1.5 text-lg font-semibold leading-none tabular-nums text-zinc-950 sm:mt-3 sm:text-2xl dark:text-zinc-100">{value}</div>
                <div className="mt-1 truncate text-[9px] text-zinc-400 sm:mt-2 sm:text-[11px] dark:text-zinc-500">{detail}</div>
            </div>
            <div className={"mt-0.5 flex size-4 shrink-0 items-center justify-center [&>svg]:size-4 sm:size-5 sm:[&>svg]:size-5 " + metricToneClass[tone]}>{icon}</div>
        </div>
    );
}
