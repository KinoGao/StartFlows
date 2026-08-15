"use client";

import dynamic from "next/dynamic";

import "@/flowcanvas/canvas-globals.css";

import { BackendWorkspaceGate } from "@/flowcanvas/components/layout/backend-workspace-gate";
import { useBackendWorkspaceSync } from "@/flowcanvas/hooks/use-backend-workspace-sync";
import { useFlowcanvasSession } from "@/flowcanvas/hooks/use-flowcanvas-session";
import { useUserStore } from "@/flowcanvas/stores/use-user-store";

// 画布依赖浏览器 API（leafer 在模块加载时读 CanvasRenderingContext2D），禁止 SSR
const FlowCanvasEditorPage = dynamic(() => import("@/flowcanvas/canvas/[id]/canvas-client-page"), { ssr: false });

export default function CanvasPage() {
    useFlowcanvasSession();
    useBackendWorkspaceSync();
    const workspaceReady = useUserStore((state) => state.hydrated && Boolean(state.user && state.token) && state.workspaceStatus === "ready");
    return workspaceReady ? <FlowCanvasEditorPage /> : <BackendWorkspaceGate title="账号工作区" />;
}
