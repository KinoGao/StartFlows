"use client";

import FlowCanvasEditorPage from "@/flowcanvas/canvas/[id]/canvas-client-page";
import { BackendWorkspaceGate } from "@/flowcanvas/components/layout/backend-workspace-gate";
import { useBackendWorkspaceSync } from "@/flowcanvas/hooks/use-backend-workspace-sync";
import { useFlowcanvasSession } from "@/flowcanvas/hooks/use-flowcanvas-session";
import { useUserStore } from "@/flowcanvas/stores/use-user-store";

export default function CanvasPage() {
    useFlowcanvasSession();
    useBackendWorkspaceSync();
    const workspaceReady = useUserStore((state) => state.hydrated && Boolean(state.user && state.token) && state.workspaceStatus === "ready");
    return workspaceReady ? <FlowCanvasEditorPage /> : <BackendWorkspaceGate title="账号工作区" />;
}
