import { generationModelId } from "@/lib/server/generation-channel";
import { isGenerationSource } from "@/lib/server/generation-log-store";
import { recordGenerationTaskLogResult } from "@/lib/server/generation-log-task-service";
import type { VideoTask } from "@/lib/server/video-task-store";

export function writeVideoGenerationLog(task: VideoTask, status: "success" | "failed", error?: string, canRetry = false) {
    const url = task.result?.url || task.result?.remoteUrl || "";
    return recordGenerationTaskLogResult({
        logId: task.generationLogId,
        slotId: task.generationSlotId,
        clientRequestId: task.clientRequestId,
        taskId: task.id,
        userId: task.userId,
        username: task.username || "",
        displayName: task.displayName || task.username || "",
        kind: "video",
        source: isGenerationSource(task.source) ? task.source : "video-workbench",
        status,
        title: task.title || task.prompt?.slice(0, 36) || "视频生成",
        prompt: task.prompt || "",
        model: generationModelId(task.config),
        summary: status === "success" ? "视频生成完成" : "视频生成失败",
        durationMs: Math.max(0, Date.now() - task.createdAt),
        asset:
            status === "success" && url
                ? {
                      type: "video",
                      url,
                      remoteUrl: task.result?.remoteUrl,
                      serverUrl: task.result?.url?.startsWith("/api/") ? task.result.url : undefined,
                      mimeType: task.result?.mimeType,
                  }
                : undefined,
        error,
        canRetry,
        taskProvider: task.upstream.provider,
        taskPollPath: task.upstream.pollPath,
        serverTaskId: task.id,
        createdAt: task.createdAt,
    });
}
