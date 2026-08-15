import { ArrowDown, ArrowRight, Check, Lightbulb } from "lucide-react";

import type { HelpArticle } from "./help-content";

export function HelpFlow({ steps }: { steps: HelpArticle["flow"] }) {
    return (
        <ol className="flex flex-col gap-2 lg:flex-row lg:items-stretch" aria-label="操作流程">
            {steps.map((step, index) => (
                <li key={step.title} className="contents">
                    <div className="min-w-0 flex-1 rounded-lg border border-border bg-card p-3 text-card-foreground sm:p-4">
                        <div className="flex items-center gap-2">
                            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background">{index + 1}</span>
                            <h3 className="min-w-0 text-sm font-semibold">{step.title}</h3>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.detail}</p>
                    </div>
                    {index < steps.length - 1 ? (
                        <span className="grid h-5 shrink-0 place-items-center text-muted-foreground lg:h-auto lg:w-5" aria-hidden="true">
                            <ArrowDown className="size-4 lg:hidden" />
                            <ArrowRight className="hidden size-4 lg:block" />
                        </span>
                    ) : null}
                </li>
            ))}
        </ol>
    );
}

export function HelpGuideSteps({ steps }: { steps: HelpArticle["steps"] }) {
    return (
        <ol className="divide-y divide-border border-y border-border">
            {steps.map((step, index) => (
                <li key={step.title} className="grid gap-3 py-5 sm:grid-cols-[36px_minmax(0,1fr)] sm:gap-4 sm:py-6">
                    <span className="grid size-8 place-items-center rounded-lg border border-border bg-muted text-xs font-semibold text-foreground">{String(index + 1).padStart(2, "0")}</span>
                    <div className="min-w-0">
                        <h3 className="text-base font-semibold text-foreground">{step.title}</h3>
                        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{step.description}</p>
                        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                            {step.checklist.map((item) => (
                                <li key={item} className="flex min-w-0 items-start gap-2 text-sm leading-5 text-foreground/85">
                                    <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                        {step.tip ? (
                            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">
                                <Lightbulb className="mt-0.5 size-3.5 shrink-0" />
                                <span>{step.tip}</span>
                            </div>
                        ) : null}
                    </div>
                </li>
            ))}
        </ol>
    );
}

export function HelpFaqList({ faqs }: { faqs: HelpArticle["faqs"] }) {
    return (
        <div className="divide-y divide-border border-y border-border">
            {faqs.map((faq) => (
                <details key={faq.question} className="group py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground marker:content-none">
                        <span>{faq.question}</span>
                        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-base font-normal text-muted-foreground transition group-open:rotate-45">+</span>
                    </summary>
                    <p className="max-w-4xl pt-3 text-sm leading-6 text-muted-foreground">{faq.answer}</p>
                </details>
            ))}
        </div>
    );
}
