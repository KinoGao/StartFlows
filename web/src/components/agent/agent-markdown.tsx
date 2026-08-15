import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

export function AgentMarkdown({ children, className }: { children: string; className?: string }) {
    return (
        <div
            className={cn("min-w-0 max-w-full break-words [overflow-wrap:anywhere]", className)}
            style={{ fontFamily: '"SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue","Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Segoe UI Symbol",sans-serif' }}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    h1: ({ children }) => <h1 className="mb-2 mt-5 text-lg font-semibold leading-7 first:mt-0">{children}</h1>,
                    h2: ({ children }) => <h2 className="mb-2 mt-5 text-base font-semibold leading-7 first:mt-0">{children}</h2>,
                    h3: ({ children }) => <h3 className="mb-1.5 mt-4 text-[15px] font-semibold leading-6 first:mt-0">{children}</h3>,
                    h4: ({ children }) => <h4 className="mb-1.5 mt-3 font-semibold first:mt-0">{children}</h4>,
                    p: ({ children }) => <p className="my-2 whitespace-pre-wrap first:mt-0 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold text-stone-950 dark:text-stone-50">{children}</strong>,
                    ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-stone-400">{children}</ul>,
                    ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-stone-500">{children}</ol>,
                    li: ({ children }) => <li className="pl-0.5">{children}</li>,
                    blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-stone-300 pl-3 text-stone-600 dark:border-stone-600 dark:text-stone-300">{children}</blockquote>,
                    hr: () => <hr className="my-5 border-0 border-t border-stone-200 dark:border-stone-700" />,
                    a: ({ children, href }) => (
                        <a href={href} target="_blank" rel="noreferrer noopener" className="font-medium text-blue-600 underline decoration-blue-500/35 underline-offset-2 hover:decoration-current dark:text-blue-400">
                            {children}
                        </a>
                    ),
                    pre: ({ children }) => <pre className="my-3 max-w-full overflow-x-auto rounded-md border border-stone-200 bg-stone-50 p-3 text-[13px] leading-6 dark:border-stone-700 dark:bg-stone-900">{children}</pre>,
                    code: ({ children, className: codeClassName }) =>
                        codeClassName ? <code className={cn("font-mono text-[13px]", codeClassName)}>{children}</code> : <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[0.9em] dark:bg-stone-800">{children}</code>,
                    table: ({ children }) => (
                        <div className="my-3 max-w-full overflow-x-auto">
                            <table className="w-full min-w-max border-collapse text-left text-sm">{children}</table>
                        </div>
                    ),
                    th: ({ children }) => <th className="border-b border-stone-300 px-2 py-1.5 font-semibold dark:border-stone-600">{children}</th>,
                    td: ({ children }) => <td className="border-b border-stone-200 px-2 py-1.5 align-top dark:border-stone-700">{children}</td>,
                }}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
}
