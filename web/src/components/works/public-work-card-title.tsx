import { cn } from "@/lib/utils";

export function PublicWorkCardTitle({ title, className }: { title: string; className?: string }) {
    return (
        <span
            className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 z-10 flex translate-y-0 flex-col justify-end px-3 pb-2.5 text-left text-white opacity-100 transition duration-300 motion-reduce:transition-none sm:translate-y-2 sm:opacity-0 sm:group-focus-within:translate-y-0 sm:group-focus-within:opacity-100 sm:group-hover:translate-y-0 sm:group-hover:opacity-100",
                className,
            )}
        >
            <strong className="block max-w-full truncate text-sm font-semibold leading-5 text-white [text-shadow:0_1px_12px_rgba(0,0,0,.55)]">{title}</strong>
        </span>
    );
}
