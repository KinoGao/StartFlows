import { AudioLines, CheckCircle2, CircleSlash, Clapperboard, FileText, Image as ImageIcon, LoaderCircle, Pause, Play, RotateCw, XCircle } from "lucide-react";

import type { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import type { AgentRun, AgentRunTask } from "./agent-run-types";

type Theme = (typeof canvasThemes)[keyof typeof canvasThemes];

const TYPE_ICON = { text: FileText, image: ImageIcon, video: Clapperboard, audio: AudioLines } as const;
const TYPE_LABEL = { text: "文本", image: "图片", video: "视频", audio: "音频" } as const;

function TaskStatusIcon({ task, theme }: { task: AgentRunTask; theme: Theme }) {
    if (task.status === "running") return <LoaderCircle className="size-3.5 animate-spin" style={{ color: theme.ui.accent }} />;
    if (task.status === "completed") return <CheckCircle2 className="size-3.5" style={{ color: theme.connection.activeColor }} />;
    if (task.status === "failed") return <XCircle className="size-3.5 text-red-500" />;
    if (task.status === "cancelled") return <CircleSlash className="size-3.5 opacity-40" />;
    return <span className="size-3.5 rounded-full border opacity-40" style={{ borderColor: theme.node.muted }} />;
}

/** Agent Run 计划确认 / 执行进度卡片（渲染在 Agent 对话流里）。 */
export function AgentRunCard({
    run,
    theme,
    onStart,
    onPause,
    onResume,
    onCancel,
    onRetryTask,
}: {
    run: AgentRun;
    theme: Theme;
    onStart: (run: AgentRun) => void;
    onPause: (run: AgentRun) => void;
    onResume: (run: AgentRun) => void;
    onCancel: (run: AgentRun) => void;
    onRetryTask: (run: AgentRun, taskId: string) => void;
}) {
    const plan = run.plan;
    const isPlanned = run.status === "planned";
    const completedCount = run.tasks.filter((task) => task.status === "completed").length;
    const buttonStyle = { borderColor: theme.toolbar.border, color: theme.node.text };
    const primaryStyle = { background: theme.ui.accent, borderColor: theme.ui.accent, color: theme.canvas.background };

    return (
        <div className="w-full max-w-md rounded-xl border p-3.5 text-xs" style={{ borderColor: theme.toolbar.border, background: theme.node.fill, color: theme.node.text }}>
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{run.title || "创作任务"}</span>
                <span className="opacity-50">
                    {run.status === "planned" ? "待确认" : run.status === "running" ? `执行中 ${completedCount}/${run.tasks.length}` : run.status === "paused" ? `已暂停 ${completedCount}/${run.tasks.length}` : run.status === "completed" ? "已完成" : run.status === "failed" ? "部分失败" : "已取消"}
                </span>
            </div>

            {isPlanned && plan?.foundation ? (
                <div className="mt-2.5 space-y-1.5 opacity-70">
                    {plan.foundation.brief.objective ? <p>目标：{plan.foundation.brief.objective}</p> : null}
                    {plan.foundation.direction.summary ? <p>视觉方向：{plan.foundation.direction.summary}</p> : null}
                </div>
            ) : null}

            <div className="mt-2.5 space-y-1.5">
                {(isPlanned ? (plan?.deliverables ?? []) : run.tasks).map((item) => {
                    const isTask = "status" in item;
                    const task = isTask ? (item as AgentRunTask) : null;
                    const deliverable = isTask ? null : item;
                    const Icon = TYPE_ICON[(task?.type ?? deliverable?.type) || "image"];
                    const deps = deliverable?.dependencies.length ? ` · 依赖 ${deliverable.dependencies.join("、")}` : "";
                    return (
                        <div key={task?.id ?? deliverable?.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5" style={{ borderColor: theme.toolbar.border }}>
                            {task ? <TaskStatusIcon task={task} theme={theme} /> : null}
                            <Icon className="size-3.5 shrink-0 opacity-60" />
                            <span className="min-w-0 flex-1 truncate">
                                {task?.title ?? deliverable?.title}
                                <span className="ml-1.5 opacity-45">
                                    {TYPE_LABEL[(task?.type ?? deliverable?.type) || "image"]}
                                    {deliverable?.count && deliverable.count > 1 ? ` ×${deliverable.count}` : ""}
                                    {deliverable?.targetNodeId ? " · 原位编辑" : ""}
                                    {deps}
                                </span>
                            </span>
                            {task?.status === "failed" ? (
                                <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 transition hover:opacity-80" style={buttonStyle} onClick={() => onRetryTask(run, task.id)}>
                                    <RotateCw className="size-3" />
                                    重试
                                </button>
                            ) : null}
                        </div>
                    );
                })}
            </div>

            {run.status === "failed" && run.tasks.some((task) => task.error) ? <p className="mt-2 text-[11px] text-red-500">{run.tasks.find((task) => task.error)?.error}</p> : null}

            <div className="mt-3 flex justify-end gap-2">
                {isPlanned ? (
                    <>
                        <button type="button" className="rounded-lg border px-3 py-1.5 transition hover:opacity-80" style={buttonStyle} onClick={() => onCancel(run)}>
                            取消
                        </button>
                        <button type="button" className="rounded-lg border px-3 py-1.5 font-medium transition hover:opacity-85" style={primaryStyle} onClick={() => onStart(run)}>
                            开始执行
                        </button>
                    </>
                ) : run.status === "running" ? (
                    <>
                        <button type="button" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 transition hover:opacity-80" style={buttonStyle} onClick={() => onPause(run)}>
                            <Pause className="size-3" />
                            暂停
                        </button>
                        <button type="button" className="rounded-lg border px-3 py-1.5 transition hover:opacity-80" style={buttonStyle} onClick={() => onCancel(run)}>
                            取消
                        </button>
                    </>
                ) : run.status === "paused" || run.status === "failed" ? (
                    <>
                        <button type="button" className="rounded-lg border px-3 py-1.5 transition hover:opacity-80" style={buttonStyle} onClick={() => onCancel(run)}>
                            取消
                        </button>
                        <button type="button" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-medium transition hover:opacity-85" style={primaryStyle} onClick={() => onResume(run)}>
                            <Play className="size-3" />
                            继续执行
                        </button>
                    </>
                ) : null}
            </div>
        </div>
    );
}
