export const generationOperationThemeClasses = {
    neutralTag: "m-0 !border-zinc-200 !bg-zinc-50 !text-zinc-700 dark:!border-zinc-700 dark:!bg-zinc-900 dark:!text-zinc-200",
    reviewTag: "m-0 !border-zinc-400 !bg-white !text-zinc-950 dark:!border-zinc-500 dark:!bg-zinc-950 dark:!text-zinc-100",
    reviewPanel: "rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm leading-6 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
    selectedAction: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/45 dark:text-sky-200",
    idleAction: "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-500 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-400 dark:hover:text-white",
    textarea:
        "!border-zinc-300 !bg-white !text-zinc-950 placeholder:!text-zinc-400 hover:!border-zinc-500 focus:!border-zinc-950 dark:!border-zinc-700 dark:!bg-zinc-950 dark:!text-zinc-100 dark:placeholder:!text-zinc-500 dark:hover:!border-zinc-500 dark:focus:!border-zinc-100",
    primaryButton:
        "!border-zinc-950 !bg-zinc-950 !text-white hover:!border-black hover:!bg-black disabled:!border-zinc-200 disabled:!bg-zinc-200 disabled:!text-zinc-400 dark:!border-zinc-100 dark:!bg-zinc-100 dark:!text-zinc-950 dark:hover:!border-white dark:hover:!bg-white dark:disabled:!border-zinc-800 dark:disabled:!bg-zinc-800 dark:disabled:!text-zinc-500",
    secondaryButton: "!border-zinc-300 !bg-white !text-zinc-700 hover:!border-zinc-500 hover:!text-zinc-950 dark:!border-zinc-700 dark:!bg-zinc-950 dark:!text-zinc-200 dark:hover:!border-zinc-500 dark:hover:!text-white",
} as const;

const statusClasses: Record<string, string> = {
    running: "m-0 !border-amber-200 !bg-amber-50 !text-amber-700 dark:!border-amber-900/70 dark:!bg-amber-950/35 dark:!text-amber-300",
    error: "m-0 !border-red-200 !bg-red-50 !text-red-700 dark:!border-red-500/40 dark:!bg-red-500/10 dark:!text-red-200",
    success: "m-0 !border-zinc-400 !bg-white !text-zinc-950 dark:!border-zinc-500 dark:!bg-zinc-950 dark:!text-zinc-100",
};

export function generationOperationStatusTagClass(status: string) {
    return statusClasses[status] || generationOperationThemeClasses.neutralTag;
}
