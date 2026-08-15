import type { CanvasAssistantSession } from "../types";
import type { CanvasAgentRunStage } from "./canvas-agent-progress";

export type CanvasAssistantRunState = {
    runId?: string;
    assistantMessageId: string;
    paused: boolean;
    stage: CanvasAgentRunStage;
};

export type CanvasAssistantRunStates = Record<string, CanvasAssistantRunState>;

export function setCanvasAssistantRun(states: CanvasAssistantRunStates, sessionId: string, run: CanvasAssistantRunState) {
    return { ...states, [sessionId]: run };
}

export function patchCanvasAssistantRun(states: CanvasAssistantRunStates, sessionId: string, runId: string, patch: Partial<CanvasAssistantRunState>) {
    const current = states[sessionId];
    return current?.runId === runId ? { ...states, [sessionId]: { ...current, ...patch } } : states;
}

export function clearCanvasAssistantRun(states: CanvasAssistantRunStates, sessionId: string, identity: string) {
    const current = states[sessionId];
    if (!current || (current.runId !== identity && current.assistantMessageId !== identity)) return states;
    const next = { ...states };
    delete next[sessionId];
    return next;
}

export function findCanvasAssistantRunSession(sessions: CanvasAssistantSession[], runId: string, conversationId?: string) {
    return sessions.find((session) => session.messages.some((item) => item.runId === runId)) || (conversationId ? sessions.find((session) => session.conversationId === conversationId) : undefined);
}
