import type { CreativeAsset, CreativeMessage } from "@/lib/creative-runtime-contract";
import type { CreativeAgentRun } from "@/services/api/creative";

export type CreativeConversationEntry = { type: "round"; id: string; user: CreativeMessage; assistant: CreativeMessage; run?: CreativeAgentRun } | { type: "message"; id: string; message: CreativeMessage; run?: CreativeAgentRun };

export function creativeConversationEntries(messages: CreativeMessage[], runDetails: Record<string, CreativeAgentRun>) {
    const entries: CreativeConversationEntry[] = [];
    for (let index = 0; index < messages.length; index += 1) {
        const message = messages[index];
        const next = messages[index + 1];
        if (message.role === "user" && next?.role === "assistant" && messagesShareRun(message, next)) {
            const runId = next.runId || message.runId;
            entries.push({ type: "round", id: runId || `${message.id}:${next.id}`, user: message, assistant: next, run: runId ? runDetails[runId] : undefined });
            index += 1;
            continue;
        }
        entries.push({ type: "message", id: message.id, message, run: message.runId ? runDetails[message.runId] : undefined });
    }
    return entries;
}

export function isMediaCreativeRound(run: CreativeAgentRun | undefined, assets: CreativeAsset[]) {
    if (assets.some((asset) => asset.type === "image" || asset.type === "video" || asset.type === "audio")) return true;
    if (run?.tasks.some((task) => task.type === "image" || task.type === "video" || task.type === "audio")) return true;
    return run?.generationPreferences?.mode === "image" || run?.generationPreferences?.mode === "video" || run?.generationPreferences?.mode === "audio";
}

function messagesShareRun(user: CreativeMessage, assistant: CreativeMessage) {
    if (user.runId && assistant.runId) return user.runId === assistant.runId;
    return assistant.sequence === user.sequence + 1;
}
