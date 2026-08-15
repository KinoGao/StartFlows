import type { CanvasProject, CanvasProjectMutation } from "./canvas-project-contract";

export function createCanvasProjectMutation(previous: CanvasProject, next: CanvasProject, mutationId: string): CanvasProjectMutation {
    const mutation: CanvasProjectMutation = { mutationId, baseUpdatedAt: previous.updatedAt };
    if (previous.title !== next.title) mutation.title = next.title;
    if (previous.creativeConversationId !== next.creativeConversationId) mutation.creativeConversationId = next.creativeConversationId;
    if (previous.activeChatId !== next.activeChatId) mutation.activeChatId = next.activeChatId;
    if (previous.backgroundMode !== next.backgroundMode) mutation.backgroundMode = next.backgroundMode;
    if (previous.showImageInfo !== next.showImageInfo) mutation.showImageInfo = next.showImageInfo;
    if (!sameValue(previous.viewport, next.viewport)) mutation.viewport = next.viewport;

    const nodeChanges = diffEntities(previous.nodes, next.nodes);
    if (nodeChanges.upserts.length) mutation.nodeUpserts = nodeChanges.upserts;
    if (nodeChanges.deletes.length) mutation.nodeDeletes = nodeChanges.deletes;

    const connectionChanges = diffEntities(previous.connections, next.connections);
    if (connectionChanges.upserts.length) mutation.connectionUpserts = connectionChanges.upserts;
    if (connectionChanges.deletes.length) mutation.connectionDeletes = connectionChanges.deletes;

    const sessionChanges = diffEntities(previous.chatSessions, next.chatSessions);
    if (sessionChanges.upserts.length) mutation.chatSessionUpserts = sessionChanges.upserts;
    if (sessionChanges.deletes.length) mutation.chatSessionDeletes = sessionChanges.deletes;
    return mutation;
}

export function applyCanvasProjectMutation(previous: CanvasProject, mutation: CanvasProjectMutation, updatedAt = previous.updatedAt): CanvasProject {
    return {
        ...previous,
        ...(mutation.title === undefined ? {} : { title: mutation.title }),
        ...(mutation.creativeConversationId === undefined ? {} : { creativeConversationId: mutation.creativeConversationId }),
        ...(mutation.activeChatId === undefined ? {} : { activeChatId: mutation.activeChatId }),
        ...(mutation.backgroundMode === undefined ? {} : { backgroundMode: mutation.backgroundMode }),
        ...(mutation.showImageInfo === undefined ? {} : { showImageInfo: mutation.showImageInfo }),
        ...(mutation.viewport === undefined ? {} : { viewport: mutation.viewport }),
        nodes: applyEntityChanges(previous.nodes, mutation.nodeUpserts, mutation.nodeDeletes),
        connections: applyEntityChanges(previous.connections, mutation.connectionUpserts, mutation.connectionDeletes),
        chatSessions: applyEntityChanges(previous.chatSessions, mutation.chatSessionUpserts, mutation.chatSessionDeletes),
        updatedAt,
    };
}

export function hasCanvasProjectMutationChanges(mutation: CanvasProjectMutation) {
    return Object.keys(mutation).some((key) => key !== "mutationId" && key !== "baseUpdatedAt");
}

function diffEntities<T extends { id: string }>(previous: T[], next: T[]) {
    const previousById = new Map(previous.map((item) => [item.id, item]));
    const nextById = new Map(next.map((item) => [item.id, item]));
    const upserts = next.filter((item) => !sameValue(previousById.get(item.id), item));
    const deletes = previous.filter((item) => !nextById.has(item.id)).map((item) => item.id);
    return { upserts, deletes };
}

function applyEntityChanges<T extends { id: string }>(previous: T[], upserts: T[] | undefined, deletes: string[] | undefined) {
    const deleted = new Set(deletes || []);
    const replacements = new Map((upserts || []).map((item) => [item.id, item]));
    const existingIds = new Set(previous.map((item) => item.id));
    const result = previous.filter((item) => !deleted.has(item.id)).map((item) => replacements.get(item.id) || item);
    result.push(...(upserts || []).filter((item) => !deleted.has(item.id) && !existingIds.has(item.id)));
    return result;
}

function sameValue(left: unknown, right: unknown) {
    return JSON.stringify(left) === JSON.stringify(right);
}
