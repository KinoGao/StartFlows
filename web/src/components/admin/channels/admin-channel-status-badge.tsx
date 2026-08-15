import { channelWorkspaceStatusLabel, type ChannelWorkspaceStatus } from "./admin-channel-workspace-model";

const statusTone: Record<ChannelWorkspaceStatus, string> = {
    enabled: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-300",
    draft: "border-stone-200 bg-stone-50 text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300",
    disabled: "border-stone-200 bg-stone-100 text-stone-500 dark:border-stone-800 dark:bg-stone-900/70 dark:text-stone-400",
};

export function ChannelStatusBadge({ status }: { status: ChannelWorkspaceStatus }) {
    return <span className={`inline-flex h-6 shrink-0 items-center rounded border px-2 text-xs font-medium ${statusTone[status]}`}>{channelWorkspaceStatusLabel(status)}</span>;
}
