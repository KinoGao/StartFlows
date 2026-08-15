"use client";

import { useCanvasFileActions } from "./use-canvas-file-actions";
import type { CanvasInteractions } from "./use-canvas-interactions";
import { useCanvasMediaSessionActions } from "./use-canvas-media-session-actions";
import { useCanvasNodeMediaActions } from "./use-canvas-node-media-actions";
import type { CanvasPageState } from "./use-canvas-page-state";
import type { CanvasTaskRuntime } from "./use-canvas-task-runtime";

export function useCanvasMediaActions({ state, tasks, interactions }: { state: CanvasPageState; tasks: CanvasTaskRuntime; interactions: CanvasInteractions }) {
    const files = useCanvasFileActions({ state, interactions });
    const nodes = useCanvasNodeMediaActions({ state, tasks, interactions });
    const session = useCanvasMediaSessionActions({ state, interactions, files });
    return { ...files, ...nodes, ...session };
}

export type CanvasMediaActions = ReturnType<typeof useCanvasMediaActions>;
