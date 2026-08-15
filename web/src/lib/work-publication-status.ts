import type { WorkPublicationModerationStatus } from "@/services/api/work-publications";

export function workStatusToneClass(status: WorkPublicationModerationStatus | "revoked") {
    if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/35 dark:text-amber-300";
    if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/35 dark:text-emerald-300";
    if (status === "rejected" || status === "taken_down" || status === "revoked") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/35 dark:text-rose-300";
    return "border-border bg-muted/60 text-muted-foreground";
}
