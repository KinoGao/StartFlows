"use client";

import { useCanvasInteractionCore } from "./use-canvas-interaction-core";
import { useCanvasNavigationActions } from "./use-canvas-navigation-actions";
import { useCanvasNodeActions } from "./use-canvas-node-actions";
import type { CanvasPageState } from "./use-canvas-page-state";

export function useCanvasInteractions({ state }: { state: CanvasPageState }) {
    const core = useCanvasInteractionCore({ state });
    const nodeActions = useCanvasNodeActions({ state, core });
    const navigation = useCanvasNavigationActions({ state });
    return { ...core, ...nodeActions, ...navigation };
}

export type CanvasInteractions = ReturnType<typeof useCanvasInteractions>;
