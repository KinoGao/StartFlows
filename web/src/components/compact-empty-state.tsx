import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

export function CompactEmptyState({ title, description, icon, action, className }: { title: string; description?: string; icon?: ReactNode; action?: ReactNode; className?: string }) {
    return (
        <div className={cn("flex min-h-16 items-center justify-center rounded-lg border border-dashed border-border px-3 py-2.5 text-center", className)}>
            <div className="flex max-w-md flex-col items-center">
                <span className="grid size-7 place-items-center rounded-md bg-muted text-muted-foreground">{icon || <Inbox className="size-3.5" />}</span>
                <div className="mt-1.5 text-sm font-medium text-foreground">{title}</div>
                {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
                {action ? <div className="mt-3">{action}</div> : null}
            </div>
        </div>
    );
}
