import { nanoid } from "nanoid";
import { create } from "zustand";

import type { CanvasBackgroundMode } from "@/flowcanvas/lib/canvas-theme";
import { normalizeCanvasConnectionOrders, normalizeCanvasNodeIdentities, type CanvasNodeSequenceCounters } from "../utils/canvas-node-identity";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, CanvasNodeType, ViewportTransform } from "../types";

export type CanvasProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    nodeSequenceCounters: CanvasNodeSequenceCounters;
    referenceOrderCounter: number;
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    snapToGrid: boolean;
    alignmentGuidesEnabled: boolean;
    showImageInfo: boolean;
    showConnections: boolean;
    viewport: ViewportTransform;
};

type CanvasProjectDetail = Pick<CanvasProject, "nodes" | "connections" | "nodeSequenceCounters" | "referenceOrderCounter" | "chatSessions" | "activeChatId" | "backgroundMode" | "snapToGrid" | "alignmentGuidesEnabled" | "showImageInfo" | "showConnections" | "viewport">;

type CanvasStore = {
    hydrated: boolean;
    projects: CanvasProject[];
    projectTombstones: Record<string, string>;
    createProject: (title?: string) => string;
    importProject: (project: Partial<CanvasProject>) => string;
    openProject: (id: string) => CanvasProject | null;
    renameProject: (id: string, title: string) => void;
    deleteProjects: (ids: string[]) => void;
    replaceProjects: (projects: CanvasProject[], projectTombstones?: Record<string, string>) => void;
    updateProject: (id: string, patch: Partial<CanvasProjectDetail>) => void;
};

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };

function emptyProjectDetail(): CanvasProjectDetail {
    return {
        nodes: [],
        connections: [],
        nodeSequenceCounters: {},
        referenceOrderCounter: 0,
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "dots",
        snapToGrid: false,
        alignmentGuidesEnabled: true,
        showImageInfo: false,
        showConnections: true,
        viewport: initialViewport,
    };
}

function normalizeProjectDetail(source: Partial<CanvasProjectDetail> = {}): CanvasProjectDetail {
    const nodeIdentity = normalizeCanvasNodeIdentities(
        Array.isArray(source.nodes) ? source.nodes : [],
        source.nodeSequenceCounters,
    );
    const connectionOrder = normalizeCanvasConnectionOrders(
        Array.isArray(source.connections) ? source.connections : [],
        source.referenceOrderCounter,
    );
    return {
        nodes: nodeIdentity.nodes,
        connections: connectionOrder.connections,
        nodeSequenceCounters: nodeIdentity.nodeSequenceCounters,
        referenceOrderCounter: connectionOrder.referenceOrderCounter,
        chatSessions: Array.isArray(source.chatSessions) ? source.chatSessions : [],
        activeChatId: source.activeChatId || null,
        backgroundMode: source.backgroundMode || "dots",
        snapToGrid: Boolean(source.snapToGrid),
        alignmentGuidesEnabled: source.alignmentGuidesEnabled !== false,
        showImageInfo: Boolean(source.showImageInfo),
        showConnections: source.showConnections !== false,
        viewport: source.viewport || initialViewport,
    };
}

function normalizeProject(source: Partial<CanvasProject>, fallbackTitle = "未命名画布"): CanvasProject {
    const now = new Date().toISOString();
    return {
        id: source.id || nanoid(),
        title: source.title || fallbackTitle,
        createdAt: source.createdAt || now,
        updatedAt: source.updatedAt || now,
        ...normalizeProjectDetail(source),
    };
}

function createCanvasProject(title: string) {
    const now = new Date().toISOString();
    return normalizeProject({ id: nanoid(), title, createdAt: now, updatedAt: now, ...emptyProjectDetail() });
}

export const useCanvasStore = create<CanvasStore>()((set, get) => ({
    hydrated: true,
    projects: [],
    projectTombstones: {},
    createProject: (title = "未命名画布") => {
        const project = createCanvasProject(title);
        set((state) => {
            const { [project.id]: _removed, ...projectTombstones } = state.projectTombstones;
            return { projects: [project, ...state.projects], projectTombstones };
        });
        return project.id;
    },
    importProject: (source) => {
        const project = normalizeProject({ ...source, id: nanoid(), updatedAt: new Date().toISOString() }, "导入画布");
        set((state) => {
            const { [project.id]: _removed, ...projectTombstones } = state.projectTombstones;
            return { projects: [project, ...state.projects], projectTombstones };
        });
        return project.id;
    },
    openProject: (id) => get().projects.find((project) => project.id === id) || null,
    renameProject: (id, title) =>
        set((state) => ({
            projects: state.projects.map((project) => (project.id === id ? { ...project, title: title.trim() || project.title, updatedAt: new Date().toISOString() } : project)),
        })),
    deleteProjects: (ids) =>
        set((state) => {
            const deletedAt = new Date().toISOString();
            const projectTombstones = { ...state.projectTombstones };
            ids.forEach((id) => {
                projectTombstones[id] = deletedAt;
            });
            return { projects: state.projects.filter((project) => !ids.includes(project.id)), projectTombstones };
        }),
    replaceProjects: (projects, projectTombstones = get().projectTombstones) => set({ projects: projects.map((project) => normalizeProject(project)), projectTombstones }),
    updateProject: (id, patch) =>
        set((state) => ({
            projects: state.projects.map((project) => (project.id === id ? { ...project, ...patch, updatedAt: new Date().toISOString() } : project)),
        })),
}));
