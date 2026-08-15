export type GenerationLogSnapshotParameters = {
    model?: string;
    size?: string;
    quality?: string;
    count?: string;
    resolution?: string;
    seconds?: string;
    generateAudio?: string;
    watermark?: string;
};

export type GenerationLogReferenceSnapshot = {
    id: string;
    kind: "image" | "video" | "audio";
    name: string;
    mimeType: string;
    url?: string;
    remoteUrl?: string;
    serverUrl?: string;
    storageKey?: string;
    bytes?: number;
    width?: number;
    height?: number;
    durationMs?: number;
};

export type GenerationLogSlotSnapshot = {
    id: string;
    index: number;
    status: "pending" | "success" | "failed";
    prompt?: string;
    parameters?: GenerationLogSnapshotParameters;
    referenceIds?: string[];
    assetIndex?: number;
    clientRequestId?: string;
    taskId?: string;
    taskKind?: "generation" | "edit";
    taskProvider?: "openai" | "seedance" | "generation";
    taskModel?: string;
    taskPollPath?: string;
    taskResultUrl?: string;
    serverTaskId?: string;
    startedAt?: number;
    error?: string;
    canRetry?: boolean;
};

export type GenerationLogRequestSnapshot = {
    version: 1;
    userPrompt?: string;
    parameters: GenerationLogSnapshotParameters;
    references: GenerationLogReferenceSnapshot[];
    slots: GenerationLogSlotSnapshot[];
};

export function generationLogPublicPrompt(log: { prompt?: string; creativeConversationId?: string; requestSnapshot?: Pick<GenerationLogRequestSnapshot, "userPrompt"> }) {
    const userPrompt = log.requestSnapshot?.userPrompt?.trim();
    if (userPrompt) return userPrompt;
    return log.creativeConversationId ? "" : String(log.prompt || "").trim();
}

export function generationLogDraftSnapshot(snapshot?: GenerationLogRequestSnapshot): GenerationLogRequestSnapshot | undefined {
    if (!snapshot) return undefined;
    return {
        ...snapshot,
        slots: snapshot.slots.flatMap((slot) =>
            slot.status === "pending" && slot.clientRequestId
                ? [
                      {
                          id: slot.id,
                          index: slot.index,
                          status: "pending" as const,
                          prompt: slot.prompt,
                          parameters: slot.parameters,
                          referenceIds: slot.referenceIds,
                          clientRequestId: slot.clientRequestId,
                          taskKind: slot.taskKind,
                          taskModel: slot.taskModel,
                          startedAt: slot.startedAt,
                      },
                  ]
                : [],
        ),
    };
}
