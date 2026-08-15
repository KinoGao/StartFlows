export type LocalMediaClass = "temporary" | "permanent";
export type LocalMediaType = "image" | "video" | "audio";
export type ManagedMediaType = LocalMediaType | "attachment";

export type LocalMediaAsset = {
    id: string;
    storageKey: string;
    storageClass: LocalMediaClass;
    type: ManagedMediaType;
    scope: "generation" | "reference";
    name: string;
    directory: string;
    bytes: number;
    createdAt: string;
    expiresAt?: string;
    url: string;
    ownerUserId?: string;
    ownerAccountId?: string;
    ownerUsername?: string;
    ownerDisplayName?: string;
    originalName?: string;
    source?: string;
    conversationId?: string;
    runId?: string;
    taskId?: string;
    projectId?: string;
    mimeType?: string;
    referenceCount: number;
};

export type LocalMediaStoragePayload = {
    items: LocalMediaAsset[];
    total: number;
    page: number;
    pageSize: number;
    summary: {
        totalFiles: number;
        totalBytes: number;
        temporaryFiles: number;
        temporaryBytes: number;
        permanentFiles: number;
        permanentBytes: number;
        expiredTemporaryFiles: number;
    };
};
