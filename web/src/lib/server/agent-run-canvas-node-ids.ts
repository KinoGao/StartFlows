import type { AgentRunTask } from "@/lib/server/agent-run-store";
import { agentTaskCopies } from "@/lib/server/agent-run-validation";

export function agentCanvasTaskNodeId(runId: string, taskIndex: number) {
    return `task-${runId}-${taskIndex}`;
}

export function agentCanvasOutputNodeIds(runId: string, taskIndex: number, task: Pick<AgentRunTask, "type" | "count">) {
    return Array.from({ length: agentTaskCopies(task.type, task.count) }, (_, copyIndex) => `output-${runId}-${taskIndex}-${copyIndex}`);
}
