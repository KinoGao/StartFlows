import { cn } from "@/lib/utils";

const toolButtonBaseClass =
    "shrink-0 !h-11 !min-w-11 !gap-1.5 !rounded-xl !border !border-[#e1e5e9] !bg-white !px-2.5 !text-[#596572] transition-colors hover:!border-[#d4dae0] hover:!bg-[#f7f8f9] hover:!text-[#303943] focus:!border-[#e1e5e9] focus:!bg-white focus:!text-[#596572] active:!border-[#e1e5e9] active:!bg-white active:!text-[#596572] dark:!border-[#363c44] dark:!bg-[#1d2025] dark:!text-[#b2bbc5] dark:hover:!border-[#49515b] dark:hover:!bg-[#292f37] dark:hover:!text-white dark:focus:!border-[#363c44] dark:focus:!bg-[#1d2025] dark:focus:!text-[#b2bbc5] dark:active:!border-[#363c44] dark:active:!bg-[#1d2025] dark:active:!text-[#b2bbc5] sm:!px-3";

const toolButtonOpenClass =
    "!border-[#cfd6dc] !bg-[#eef2f4] !text-[#303943] focus:!border-[#cfd6dc] focus:!bg-[#eef2f4] focus:!text-[#303943] active:!border-[#cfd6dc] active:!bg-[#eef2f4] active:!text-[#303943] dark:!border-[#4b5561] dark:!bg-[#2a3037] dark:!text-white dark:focus:!border-[#4b5561] dark:focus:!bg-[#2a3037] dark:focus:!text-white dark:active:!border-[#4b5561] dark:active:!bg-[#2a3037] dark:active:!text-white";

export function creativeComposerToolButtonClass(open: boolean) {
    return cn(toolButtonBaseClass, open && toolButtonOpenClass);
}
