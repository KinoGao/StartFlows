import type { CanvasProject, CanvasProjectSummary } from "@/lib/canvas-project-contract";

export function summarizeCanvasProjectRecord(project: CanvasProject): CanvasProjectSummary {
    return {
        id: project.id,
        sourceHandoffId: project.sourceHandoffId,
        creativeConversationId: project.creativeConversationId,
        title: project.title,
        nodeCount: project.nodes.length,
        connectionCount: project.connections.length,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
    };
}
