import { create } from "zustand";

import type { CanvasAgentOp } from "../utils/canvas-agent-ops";

export type AgentChatRole = "user" | "assistant" | "system" | "tool" | "error";
export type AgentAttachment = { id: string; name: string; type: string; size: number; url: string; dataUrl: string };
export type AgentChatItem = { id: string; role: AgentChatRole; title?: string; text: string; meta?: string; detail?: unknown; attachments?: AgentAttachment[]; streamId?: string };
export type AgentEventLog = { id: string; time: string; title: string; text: string; raw?: unknown };
export type AgentPendingToolCall = { requestId: string; name: string; input?: { ops?: CanvasAgentOp[] } };
export type AgentPanelTab = "chat" | "setup" | "log";
export type AgentMode = "default" | "script" | "production";

export type PipelineStageInfo = { name: string; order: number; completed: boolean };
export type PipelineInfo = { id: string; mode: string; currentStage: string; stages: PipelineStageInfo[]; status: string };

type CanvasAgentStore = {
    width: number;
    url: string;
    token: string;
    connected: boolean;
    enabled: boolean;
    prompt: string;
    attachments: AgentAttachment[];
    sending: boolean;
    waiting: boolean;
    messages: AgentChatItem[];
    eventLogs: AgentEventLog[];
    activeTab: AgentPanelTab;
    agentMode: AgentMode;
    storySkill: string | null;
    artSkill: string | null;
    directorSkill: string | null;
    pipelineId: string | null;
    pipeline: PipelineInfo | null;
    confirmTools: boolean;
    activity: string;
    connectError: string;
    pendingTool: AgentPendingToolCall | null;
    setAgentState: (patch: Partial<Omit<CanvasAgentStore, "setAgentState" | "addMessage" | "addEventLog" | "clearEventLogs">>) => void;
    addMessage: (item: AgentChatItem) => void;
    addEventLog: (item: AgentEventLog) => void;
    clearEventLogs: () => void;
};

export const useCanvasAgentStore = create<CanvasAgentStore>((set) => ({
    width: typeof window === "undefined" ? 440 : Number(localStorage.getItem("canvas-agent-panel-width")) || 440,
    url: typeof window === "undefined" ? "http://127.0.0.1:17371" : localStorage.getItem("canvas-agent-url") || "http://127.0.0.1:17371",
    token: typeof window === "undefined" ? "" : localStorage.getItem("canvas-agent-token") || "",
    connected: false,
    enabled: false,
    prompt: "",
    attachments: [],
    sending: false,
    waiting: false,
    messages: [],
    eventLogs: [],
    activeTab: "setup",
    agentMode: (typeof window === "undefined" ? "default" : localStorage.getItem("canvas-agent-mode") || "default") as AgentMode,
    storySkill: typeof window === "undefined" ? null : localStorage.getItem("canvas-agent-story-skill") || null,
    artSkill: typeof window === "undefined" ? null : localStorage.getItem("canvas-agent-art-skill") || null,
    directorSkill: typeof window === "undefined" ? null : localStorage.getItem("canvas-agent-director-skill") || null,
    pipelineId: null,
    pipeline: null,
    confirmTools: true,
    activity: "就绪",
    connectError: "",
    pendingTool: null,
    setAgentState: (patch) => set(patch),
    addMessage: (item) => set((state) => ({ messages: [...state.messages.slice(-120), item] })),
    addEventLog: (item) => set((state) => ({ eventLogs: [...state.eventLogs.slice(-160), item] })),
    clearEventLogs: () => set({ eventLogs: [] }),
}));
