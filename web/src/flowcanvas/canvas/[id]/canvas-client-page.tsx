"use client";

import { Fragment, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent as ReactChangeEvent, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useNavigate, useParams } from "@/flowcanvas/lib/next-router";
import { Bot, Box, Check, Clapperboard, CloudOff, FileText, FolderOpen, Home, ImageIcon, Images, Layers3, Link2, List, LoaderCircle, Menu, Music2, Plus, Search, Share2, Sparkles, Trash2, Upload, Video, Workflow, X } from "lucide-react";

import { saveAs } from "file-saver";

import { requestEdit, requestGeneration, requestImageQuestion, type AiTextMessage } from "@/flowcanvas/services/api/image";
import { requestAudioGeneration, storeGeneratedAudio } from "@/flowcanvas/services/api/audio";
import { createVideoGenerationTask, storeGeneratedVideo, waitForVideoGenerationTask, type VideoGenerationTask } from "@/flowcanvas/services/api/video";
import { createCanvasProjectOnServer, pushBackendProjects } from "@/flowcanvas/services/api/backend-storage";
import { listCanvasTemplates, saveCanvasTemplate, deleteCanvasTemplate } from "@/flowcanvas/services/api/canvas-templates";
import { runComfyWorkflow, uploadComfyFile } from "@/flowcanvas/services/api/comfyui";
import { applyComfyWorkflowFields, getComfyWorkflow, listComfyWorkflows, type ComfyWorkflow, type ComfyWorkflowField } from "@/flowcanvas/services/comfyui-workflows";
import { defaultConfig, type AiConfig, type ComfyUiConfig, useConfigStore, useEffectiveConfig } from "@/flowcanvas/stores/use-config-store";
import { getImageBlob, imageToDataUrl, resolveImageUrl, uploadImage, type UploadedImage } from "@/flowcanvas/services/image-storage";
import { getMediaBlob, resolveMediaUrl, uploadMediaFile, type UploadedFile } from "@/flowcanvas/services/file-storage";
import { nanoid } from "nanoid";
import { dataUrlToBlob, getDataUrlByteSize, readImageMeta } from "@/flowcanvas/lib/image-utils";
import { canvasThemes, type CanvasBackgroundMode } from "@/flowcanvas/lib/canvas-theme";
import { useAssetStore } from "@/flowcanvas/stores/use-asset-store";
import { useUserStore } from "@/flowcanvas/stores/use-user-store";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";
import { cropDataUrl, splitDataUrl, upscaleDataUrl } from "../utils/canvas-image-data";
import { fitNodeSize, nodeSizeFromRatio, VIDEO_NODE_SIZE_RANGE } from "../utils/canvas-node-size";
import { App, Button, Dropdown, Modal, message } from "antd";
import { NODE_DEFAULT_SIZE, getConfigNodeHeight, getNodeSpec } from "../constants";
import { CanvasConfigComposer } from "../components/canvas-config-composer";
import { CanvasWorkflowToolbox } from "../components/canvas-workflow-toolbox";
import { CanvasNodeContextMenu } from "../components/canvas-context-menu";
import { CanvasCreateNodeMenu, type CanvasCreateMenuAction } from "../components/canvas-create-node-menu";
import { ErrorBoundary } from "@/flowcanvas/components/ui/error-boundary";
import { BackendWorkspaceGate } from "@/flowcanvas/components/layout/backend-workspace-gate";
import type { CanvasImageAngleParams } from "../components/canvas-node-angle-dialog";
import type { CanvasImageCropRect } from "../components/canvas-node-crop-dialog";
import type { CanvasImageMaskEditPayload } from "../components/canvas-node-mask-edit-dialog";
import type { CanvasImageSplitParams } from "../components/canvas-node-split-dialog";
import type { CanvasImageUpscaleParams } from "../components/canvas-node-upscale-dialog";
import { buildNodeGenerationContext, buildNodeGenerationInputs, buildNodeResponseMessages, hydrateNodeGenerationContext, type NodeGenerationContext, type NodeGenerationInput } from "../components/canvas-node-generation";
import { LeaferCanvas } from "../components/leafer-canvas";
import { CanvasColorGroupBar } from "../components/canvas-color-group-bar";
import { CanvasSearchPanel } from "../components/canvas-search-panel";
import { CanvasNode, type CanvasNodeProps } from "../components/canvas-node";
import type { CanvasNodeGenerationMode } from "../components/canvas-node-prompt-panel";
import { CanvasToolbar } from "../components/canvas-toolbar";
import type { InsertAssetPayload } from "../components/asset-picker-modal";
import { CanvasZoomControls } from "../components/canvas-zoom-controls";
import { CanvasMiniMap } from "../components/canvas-minimap";
import { centerViewportOnRect, clampCanvasZoom, stepCanvasZoom } from "../components/leafer-viewport";
import { useCanvasStore } from "../stores/use-canvas-store";
import { applyCanvasAgentOps, CANVAS_AGENT_SIDE_EFFECT_OP_TYPES, type CanvasAgentOp, type CanvasAgentSnapshot } from "../utils/canvas-agent-ops";
import { buildBatchVisibilityIndex, buildConnectionAdjacency, buildNodeById, normalizeConnectionWithNodeMap, setsEqual } from "../utils/canvas-derived-indexes";
import { buildCanvasResourceReferences, buildNodeMentionReferences, createCanvasResourceGraph } from "../utils/canvas-resource-references";
import { resolveComposerOverlayPosition } from "../utils/canvas-composer-position";
import { generationRunSettlementKey, settleFinishedGenerationRuns, updateCanvasGenerationRun, upsertCanvasGenerationRun } from "../utils/canvas-generation-runs";
import { buildGroupExecutionPlan, collectGroupMemberIds, isGroupExecutableNode } from "../utils/canvas-group-execution";
import { buildGridBeatPrompt, buildScriptBeats, buildScriptBeatsWithActs } from "../utils/canvas-script-beats";
import { buildScriptAiPrompt, buildScriptBeatPrompt, parseScriptAiResponse } from "../utils/canvas-script-ai";
import { buildAssetPrompt } from "../utils/canvas-script-ai";
import { resolveScriptBeatImagePrompt, buildScriptBeatPromptsSynthPrompt, parseScriptBeatPromptsResponse, resolveScriptBeatVideoPrompt } from "../utils/canvas-script-ai";
import { composeScriptBeatVideoReferenceIds, deriveScriptBeatVideoMode, resolveScriptBeatReferenceIds } from "../utils/canvas-script-references";
import { toFetchableMediaUrl } from "../utils/canvas-media-fetch";
import { estimateCanvasTaskPoints, type CanvasSessionPricing } from "../utils/canvas-points-estimate";
import { stitchImagesToBlob } from "../utils/canvas-stitch";
import { ScriptDeskStudio, type ScriptOutputState } from "../components/script-desk-studio";
import { canvasSelectionCenter, cloneCanvasSelection, CANVAS_SLASH_COMMANDS, type CanvasSlashCommand, type CanvasWorkflowTemplate } from "../utils/canvas-workflow-template";
import { buildImageQuickCommandPrompt, CANVAS_IMAGE_QUICK_COMMANDS, type CanvasImageQuickCommand } from "../utils/canvas-image-quick-commands";
import { resolveVideoSubject, videoSubjectReferenceImages } from "../utils/canvas-video-subjects";
import {
    buildVideoStoryboardBody,
    buildVideoStoryboardPrompt,
    captureVideoFrames,
    normalizeVideoTrimRange,
    parseVideoStoryboardResponse,
    trimVideoSegment,
    type VideoTrimRange,
} from "../utils/canvas-video-tools";
import { composeVideoTimeline, createTimelineClip, withClipDuration, type TimelineClip } from "../utils/canvas-video-timeline";
import type { CompositionSource } from "../components/canvas-video-composition-dialog";
import { buildCutoutPrompt, buildLightingPrompt, buildOutpaintPrompt, buildPanorama720Prompt, type CanvasLightingSettings } from "../utils/canvas-image-tools";
import {
    allocateCanvasNodeIdentity,
    normalizeCanvasConnectionOrders,
    normalizeCanvasNodeIdentities,
    type CanvasNodeSequenceCounters,
} from "../utils/canvas-node-identity";
import type { DirectorDeskCapture } from "../director/storyai/DirectorDesk";
import type { CanvasAgentMode } from "../components/canvas-agent-chat-ui";
import {
    CanvasNodeType,
    type CanvasAlignmentGuides,
    type CanvasAssistantImage,
    type CanvasAssistantReference,
    type CanvasAssistantSession,
    type CanvasConnection,
    type CanvasImageGenerationType,
    type CanvasNodeActionIntent,
    type CanvasNodeData,
    type CanvasNodeMetadata,
    type CanvasScriptAsset,
type CanvasScriptBeat,
    type ConnectionHandle,
    type ContextMenuState,
    type Position,
    type ViewportTransform,
} from "../types";
import type { ReferenceImage } from "@/flowcanvas/types/image";
import type { ReferenceAudio } from "@/flowcanvas/types/media";
import { normalizeRuntimeModelOption } from "@/flowcanvas/services/runtime-config";

type CanvasClipboard = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

/**
 * 跨画布剪贴板：模块级单例而非组件 useRef，使同一会话内切换不同画布（[id] 路由实例）
 * 后复制内容仍可粘贴，实现「跨画布复制（带连线）」。
 * 画布媒体通过 storageKey 引用后端账号存储，跨画布粘贴时媒体引用依然有效。
 */
const crossCanvasClipboard: { current: CanvasClipboard | null } = { current: null };

type PendingConnectionCreate = {
    connection: ConnectionHandle;
    position: Position;
};

const CANVAS_OPEN_LOCK_PREFIX = "infinite-canvas:open-canvas:";
const CANVAS_OPEN_LOCK_TTL = 8000;
const CANVAS_OPEN_LOCK_HEARTBEAT = 2500;
const CANVAS_RECOVERY_MARKER_PREFIX = "infinite-canvas:recovery:";

function canvasRecoveryMarkerKey(userId: string | undefined, projectId: string) {
    return `${CANVAS_RECOVERY_MARKER_PREFIX}${userId || "anonymous"}:${projectId}`;
}

function readCanvasRecoveryMarker(key: string) {
    try {
        return window.localStorage.getItem(key) === "pending";
    } catch {
        return false;
    }
}

function writeCanvasRecoveryMarker(key: string, pending: boolean) {
    try {
        if (pending) window.localStorage.setItem(key, "pending");
        else window.localStorage.removeItem(key);
    } catch {
        // 浏览器存储不可用时仍由后端自动保存恢复。
    }
}

type CanvasOpenLock = {
    ownerId: string;
    updatedAt: number;
};

function useCanvasSingleOpenLock(projectId: string, enabled: boolean) {
    const ownerIdRef = useRef("");
    const [expired, setExpired] = useState(false);

    useEffect(() => {
        if (!enabled || !projectId || typeof window === "undefined") return;
        const ownerKey = `${CANVAS_OPEN_LOCK_PREFIX}${projectId}:owner`;
        if (!ownerIdRef.current) {
            try {
                ownerIdRef.current = window.sessionStorage.getItem(ownerKey) || "";
                if (!ownerIdRef.current) {
                    ownerIdRef.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
                    window.sessionStorage.setItem(ownerKey, ownerIdRef.current);
                }
            } catch {
                ownerIdRef.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
            }
        }
        const ownerId = ownerIdRef.current;
        const key = `${CANVAS_OPEN_LOCK_PREFIX}${projectId}`;

        const readLock = () => {
            try {
                const raw = window.localStorage.getItem(key);
                return raw ? (JSON.parse(raw) as CanvasOpenLock) : null;
            } catch {
                return null;
            }
        };
        const writeLock = () => window.localStorage.setItem(key, JSON.stringify({ ownerId, updatedAt: Date.now() } satisfies CanvasOpenLock));
        const isOtherLiveLock = (lock: CanvasOpenLock | null) => Boolean(lock && lock.ownerId !== ownerId && Date.now() - lock.updatedAt < CANVAS_OPEN_LOCK_TTL);

        if (isOtherLiveLock(readLock())) {
            setExpired(true);
            return;
        }
        setExpired(false);
        writeLock();
        const timer = window.setInterval(() => {
            if (isOtherLiveLock(readLock())) {
                setExpired(true);
                return;
            }
            writeLock();
        }, CANVAS_OPEN_LOCK_HEARTBEAT);
        const handleStorage = (event: StorageEvent) => {
            if (event.key !== key) return;
            if (isOtherLiveLock(readLock())) setExpired(true);
        };
        window.addEventListener("storage", handleStorage);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("storage", handleStorage);
            const lock = readLock();
            if (lock?.ownerId === ownerId) window.localStorage.removeItem(key);
        };
    }, [enabled, projectId]);

    return expired;
}

type CanvasHistoryEntry = Pick<CanvasClipboard, "nodes" | "connections"> & {
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    snapToGrid: boolean;
    alignmentGuidesEnabled: boolean;
    showImageInfo: boolean;
    showConnections: boolean;
};

type CanvasGenerationRequest = {
    targetNodeId: string;
    originNodeId: string;
    runningNodeId: string;
    controller: AbortController;
};

type MultiNodeDragState = {
    anchorId: string;
    anchorPosition: Position;
    nodePositions: Map<string, Position>;
};

function defaultGenerationMode(type?: CanvasNodeType): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video ? "video" : type === CanvasNodeType.Audio ? "audio" : "image";
}

function isGenerationConfigNode(type?: CanvasNodeType) {
    return type === CanvasNodeType.Config || type === CanvasNodeType.ComfyUI;
}

function reconcileGroupMembership(nodes: CanvasNodeData[]): CanvasNodeData[] {
    const groups = nodes.filter((node) => node.type === CanvasNodeType.Group);
    if (!groups.length) return nodes;

    const existingOwnerByChildId = new Map<string, string>();
    for (const group of groups) {
        for (const childId of group.metadata?.groupChildIds || []) {
            if (!existingOwnerByChildId.has(childId)) existingOwnerByChildId.set(childId, group.id);
        }
    }

    const childIdsByGroupId = new Map(groups.map((group) => [group.id, [] as string[]]));
    for (const node of nodes) {
        if (node.type === CanvasNodeType.Group) continue;
        const centerX = node.position.x + node.width / 2;
        const centerY = node.position.y + node.height / 2;
        const containingGroups = groups.filter(
            (group) =>
                centerX >= group.position.x &&
                centerX <= group.position.x + group.width &&
                centerY >= group.position.y &&
                centerY <= group.position.y + group.height,
        );
        if (!containingGroups.length) continue;

        const currentOwnerId = existingOwnerByChildId.get(node.id);
        const owner =
            containingGroups.find((group) => group.id === currentOwnerId) ||
            containingGroups.reduce((smallest, group) =>
                group.width * group.height < smallest.width * smallest.height ? group : smallest,
            );
        childIdsByGroupId.get(owner.id)?.push(node.id);
    }

    let changed = false;
    const next = nodes.map((node) => {
        if (node.type !== CanvasNodeType.Group) return node;
        const currentChildIds = node.metadata?.groupChildIds || [];
        const nextChildIds = childIdsByGroupId.get(node.id) || [];
        if (currentChildIds.length === nextChildIds.length && currentChildIds.every((id, index) => id === nextChildIds[index])) return node;
        changed = true;
        return { ...node, metadata: { ...node.metadata, groupChildIds: nextChildIds } };
    });
    return changed ? next : nodes;
}

const VIDEO_NODE_MAX_WIDTH = VIDEO_NODE_SIZE_RANGE.maxWidth;
const VIDEO_NODE_MAX_HEIGHT = VIDEO_NODE_SIZE_RANGE.maxHeight;
const CANVAS_AGENT_PANEL_MOTION_MS = 240;
const CANVAS_OVERVIEW_SCALE = 0.5;
const NODE_TOOLBAR_HIDE_DELAY_MS = 320;

const CanvasConfigNodePanel = lazy(() => import("../components/canvas-config-node-panel").then((mod) => ({ default: mod.CanvasConfigNodePanel })));
const CanvasAssistantPanel = lazy(() => import("../components/canvas-assistant-panel").then((mod) => ({ default: mod.CanvasAssistantPanel })));
const CanvasNodeAngleDialog = lazy(() => import("../components/canvas-node-angle-dialog").then((mod) => ({ default: mod.CanvasNodeAngleDialog })));
const CanvasNodeCropDialog = lazy(() => import("../components/canvas-node-crop-dialog").then((mod) => ({ default: mod.CanvasNodeCropDialog })));
const CanvasNodeMaskEditDialog = lazy(() => import("../components/canvas-node-mask-edit-dialog").then((mod) => ({ default: mod.CanvasNodeMaskEditDialog })));
const CanvasNodeOutpaintDialog = lazy(() => import("../components/canvas-node-outpaint-dialog").then((mod) => ({ default: mod.CanvasNodeOutpaintDialog })));
const CanvasNodeLightingDialog = lazy(() => import("../components/canvas-node-lighting-dialog").then((mod) => ({ default: mod.CanvasNodeLightingDialog })));
const CanvasNodeSplitDialog = lazy(() => import("../components/canvas-node-split-dialog").then((mod) => ({ default: mod.CanvasNodeSplitDialog })));
const CanvasNodeUpscaleDialog = lazy(() => import("../components/canvas-node-upscale-dialog").then((mod) => ({ default: mod.CanvasNodeUpscaleDialog })));
const CanvasVideoTrimDialog = lazy(() => import("../components/canvas-video-trim-dialog").then((mod) => ({ default: mod.CanvasVideoTrimDialog })));
const CanvasVideoCompositionDialog = lazy(() => import("../components/canvas-video-composition-dialog").then((mod) => ({ default: mod.CanvasVideoCompositionDialog })));
const CanvasNodeHoverToolbar = lazy(() => import("../components/canvas-node-hover-toolbar").then((mod) => ({ default: mod.CanvasNodeHoverToolbar })));
const CanvasNodeInfoModal = lazy(() => import("../components/canvas-node-hover-toolbar").then((mod) => ({ default: mod.CanvasNodeInfoModal })));
const CanvasNodePromptPanel = lazy(() => import("../components/canvas-node-prompt-panel").then((mod) => ({ default: mod.CanvasNodePromptPanel })));
const AssetPickerModal = lazy(() => import("../components/asset-picker-modal").then((mod) => ({ default: mod.AssetPickerModal })));
const StoryAiDirectorDesk = lazy(() => import("../director/storyai/DirectorDesk").then((mod) => ({ default: mod.StoryAiDirectorDesk })));
const LazyCanvasFallback = <CanvasRefreshShell />;
const LazyComposerFallback = <div className="grid min-h-32 place-items-center text-xs opacity-55">正在加载节点面板...</div>;
const NODE_STATUS_IDLE = "idle" as const;
const NODE_STATUS_LOADING = "loading" as const;
const NODE_STATUS_SUCCESS = "success" as const;
const NODE_STATUS_ERROR = "error" as const;
/** 画布保存状态：已保存 / 保存中 / 后端离线 / 保存失败。 */
type CanvasSaveState = "saved" | "saving" | "offline" | "error";
const EMPTY_INPUT_SUMMARY = { textCount: 0, imageCount: 0, videoCount: 0, audioCount: 0 };
const DEFAULT_SCRIPT_BODY = `第一幕：主角进入一个陌生空间，发现关键道具。
第二幕：角色做出选择，环境开始发生变化。
第三幕：情绪抵达高潮，画面停在最有记忆点的动作上。`;
const DEFAULT_PANORAMA_360_PROMPT = `生成一张真实可用于 Three.js 球形内壁贴图的 360 度室内全景图。
要求：2:1 equirectangular panorama，完整无缝环绕，左右边缘可无缝拼接，相机位于房间中心，超广角但不要鱼眼边框，水平视线，现代明亮室内空间，自然阳光，真实材质，高清细节。
禁止：普通单向照片、透视断裂、文字、水印、人物、黑边、局部裁切。`;
const MATERIAL_LIBRARY_PRESETS = {
    styles: [
        { title: "电影冷暖对比", prompt: "cinematic lighting, teal and warm contrast, realistic lens, rich shadows" },
        { title: "日系清透广告", prompt: "bright japanese commercial style, soft daylight, clean composition, airy colors" },
        { title: "暗黑科幻棚拍", prompt: "dark sci-fi studio, rim light, metal texture, controlled haze, dramatic mood" },
    ],
    effects: [
        { title: "快速推进镜头", prompt: "fast dolly in, dynamic motion, strong parallax, energetic camera movement" },
        { title: "产品环绕展示", prompt: "360 degree orbit shot, centered product, smooth turntable motion, premium lighting" },
        { title: "手持纪录片感", prompt: "subtle handheld camera, documentary realism, natural imperfection, intimate framing" },
    ],
};
const EMPTY_NODE_INPUTS: NodeGenerationInput[] = [];
const EMPTY_MENTION_REFERENCES: ReturnType<typeof buildNodeMentionReferences> = [];
const CANVAS_GRID_SIZE = 56;
const ALIGNMENT_GUIDE_SCREEN_THRESHOLD = 8;
const IMAGE_PROMPT_REVERSE_PRESET = `请根据参考图片反推一段适合用于 AI 生图的提示词。

要求：
1. 只输出提示词正文，不要解释。
2. 覆盖主体、构图、风格、光线、色彩、材质、镜头和氛围。
3. 尽量写成可直接用于生图模型的完整提示词。`;

function createCanvasNodeBase(type: CanvasNodeType, position: Position, metadata?: CanvasNodeMetadata): CanvasNodeData {
    const spec = getNodeSpec(type);
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const height = isGenerationConfigNode(type) ? getConfigNodeHeight(metadata?.generationMode || spec.metadata?.generationMode) : spec.height;

    return {
        id,
        type,
        title: spec.title,
        position: {
            x: position.x - spec.width / 2,
            y: position.y - height / 2,
        },
        width: spec.width,
        height,
        metadata: { ...spec.metadata, ...metadata },
    };
}

function snapCanvasPosition(position: Position): Position {
    return {
        x: Math.round(position.x / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE,
        y: Math.round(position.y / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE,
    };
}

function sameAlignmentGuides(left: CanvasAlignmentGuides | null, right: CanvasAlignmentGuides | null) {
    return left?.vertical === right?.vertical && left?.horizontal === right?.horizontal;
}

function resolveNodeAlignment(
    nodeId: string,
    position: Position,
    nodes: CanvasNodeData[],
    dragState: MultiNodeDragState | null,
    scale: number,
): { position: Position; guides: CanvasAlignmentGuides | null } {
    const anchor = nodes.find((node) => node.id === nodeId);
    if (!anchor) return { position, guides: null };

    const movingIds = new Set(dragState?.nodePositions.keys() || [nodeId]);
    const deltaX = dragState ? position.x - dragState.anchorPosition.x : position.x - anchor.position.x;
    const deltaY = dragState ? position.y - dragState.anchorPosition.y : position.y - anchor.position.y;
    const movingNodes = nodes.filter((node) => movingIds.has(node.id));
    if (!movingNodes.length) return { position, guides: null };

    const bounds = movingNodes.reduce(
        (result, node) => {
            const start = dragState?.nodePositions.get(node.id) || node.position;
            const left = start.x + deltaX;
            const top = start.y + deltaY;
            return {
                left: Math.min(result.left, left),
                right: Math.max(result.right, left + node.width),
                top: Math.min(result.top, top),
                bottom: Math.max(result.bottom, top + node.height),
            };
        },
        { left: Number.POSITIVE_INFINITY, right: Number.NEGATIVE_INFINITY, top: Number.POSITIVE_INFINITY, bottom: Number.NEGATIVE_INFINITY },
    );
    const movingX = [bounds.left, (bounds.left + bounds.right) / 2, bounds.right];
    const movingY = [bounds.top, (bounds.top + bounds.bottom) / 2, bounds.bottom];
    const threshold = ALIGNMENT_GUIDE_SCREEN_THRESHOLD / Math.max(scale, 0.05);
    let vertical: number | undefined;
    let horizontal: number | undefined;
    let xAdjustment = 0;
    let yAdjustment = 0;
    let xDistance = Number.POSITIVE_INFINITY;
    let yDistance = Number.POSITIVE_INFINITY;

    for (const target of nodes) {
        if (movingIds.has(target.id)) continue;
        const targetX = [target.position.x, target.position.x + target.width / 2, target.position.x + target.width];
        const targetY = [target.position.y, target.position.y + target.height / 2, target.position.y + target.height];
        for (const source of movingX) {
            for (const candidate of targetX) {
                const distance = Math.abs(candidate - source);
                if (distance <= threshold && distance < xDistance) {
                    xDistance = distance;
                    xAdjustment = candidate - source;
                    vertical = candidate;
                }
            }
        }
        for (const source of movingY) {
            for (const candidate of targetY) {
                const distance = Math.abs(candidate - source);
                if (distance <= threshold && distance < yDistance) {
                    yDistance = distance;
                    yAdjustment = candidate - source;
                    horizontal = candidate;
                }
            }
        }
    }

    const guides = vertical === undefined && horizontal === undefined ? null : { vertical, horizontal };
    return { position: { x: position.x + xAdjustment, y: position.y + yAdjustment }, guides };
}

export default function CanvasPage() {
    return (
        <ErrorBoundary>
            <Suspense fallback={LazyCanvasFallback}>
                <LeaferCanvasPage />
            </Suspense>
        </ErrorBoundary>
    );
}

function CanvasRefreshShell() {
    return (
        <main className="relative h-full min-h-0 overflow-hidden bg-background text-foreground">
            <CanvasRestoreCover />
        </main>
    );
}

function CanvasRestoreCover({ ready = false }: { ready?: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div
            className={`absolute inset-0 z-[200] grid place-items-center ${ready ? "pointer-events-none opacity-0 transition-opacity duration-200" : "pointer-events-auto opacity-100"}`}
            style={{
                backgroundColor: theme.canvas.background,
                color: theme.node.muted,
            }}
            aria-live="polite"
            aria-busy={!ready}
        >
            <div
                className="canvas-restore-status flex items-center gap-2 rounded-lg border px-3 py-2 text-xs backdrop-blur"
                style={{ background: theme.ui.material, borderColor: theme.ui.hairline }}
            >
                <span className="size-1.5 rounded-full" style={{ background: theme.ui.accent, boxShadow: `0 0 0 4px ${theme.ui.accentSoft}` }} />
                正在恢复画布
            </div>
        </div>
    );
}

function CanvasExpiredShell({ onBack }: { onBack: () => void }) {
    return (
        <main className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-[#141414] px-6 text-white">
            <div
                className="absolute inset-0 opacity-30"
                style={{
                    backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.18) 1px, transparent 1px)",
                    backgroundSize: "28px 28px",
                }}
            />
            <div className="relative z-10 w-full max-w-sm text-center">
                <div className="mb-3 text-lg font-medium">会话已过期</div>
                <p className="mb-6 text-sm leading-6 text-white/60">这个画布已经在另一个窗口中打开。为了避免多个窗口同时写入导致数据覆盖，当前窗口已停止加载。</p>
                <Button type="primary" onClick={onBack}>
                    返回画布列表
                </Button>
            </div>
        </main>
    );
}

function ConnectionCreateMenu({
    pending,
    position,
    onCreate,
    onClose,
}: {
    pending: PendingConnectionCreate;
    position: Position;
    onCreate: (type: CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.ComfyUI | CanvasNodeType.Video | CanvasNodeType.Audio) => void;
    onClose: () => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const menuRef = useRef<HTMLDivElement>(null);
    const [menuPosition, setMenuPosition] = useState(position);

    useEffect(() => {
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Node && menuRef.current?.contains(target)) return;
            onClose();
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("pointerdown", closeOnOutsidePointer, true);
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [onClose]);

    useLayoutEffect(() => {
        const element = menuRef.current;
        const offsetParent = element?.offsetParent as HTMLElement | null;
        if (!element || !offsetParent) return;
        let frame = 0;
        const updatePosition = () => {
            const padding = 12;
            const { width, height } = element.getBoundingClientRect();
            if (!width || !height) return;
            const nextPosition = {
                x: Math.min(Math.max(padding, position.x), Math.max(padding, offsetParent.clientWidth - width - padding)),
                y: Math.min(Math.max(padding, position.y), Math.max(padding, offsetParent.clientHeight - height - padding)),
            };
            setMenuPosition((current) => (current.x === nextPosition.x && current.y === nextPosition.y ? current : nextPosition));
        };
        const scheduleUpdate = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(updatePosition);
        };
        scheduleUpdate();
        const observer = new ResizeObserver(scheduleUpdate);
        observer.observe(element);
        observer.observe(offsetParent);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [position.x, position.y]);

    return (
        <div
            ref={menuRef}
            className="nodrag nopan absolute z-[120] w-[300px] rounded-[18px] border p-3 shadow-2xl backdrop-blur"
            data-connection-create-menu
            style={{ left: menuPosition.x, top: menuPosition.y, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium" style={{ color: theme.node.muted }}>
                    引用该节点生成
                </span>
                <button type="button" className="grid size-7 place-items-center rounded-lg text-base opacity-55 transition hover:bg-white/10 hover:opacity-100" onClick={onClose} aria-label="关闭">
                    ×
                </button>
            </div>
            <div className="grid gap-1">
                <ConnectionCreateOption theme={theme} icon={<List className="size-5" />} title="文本生成" description="脚本、广告词、品牌文案" onClick={() => onCreate(CanvasNodeType.Text)} />
                <ConnectionCreateOption theme={theme} icon={<ImageIcon className="size-5" />} title="图片生成" onClick={() => onCreate(CanvasNodeType.Image)} />
                <ConnectionCreateOption theme={theme} icon={<Video className="size-5" />} title="视频生成" onClick={() => onCreate(CanvasNodeType.Video)} />
                <ConnectionCreateOption theme={theme} icon={<Music2 className="size-5" />} title="音频参考" onClick={() => onCreate(CanvasNodeType.Audio)} />
                <ConnectionCreateOption theme={theme} icon={<Workflow className="size-5" />} title="ComfyUI" description="本地工作流与已连接素材" onClick={() => onCreate(CanvasNodeType.ComfyUI)} />
            </div>
        </div>
    );
}

function ConnectionCreateOption({ theme, icon, title, description, onClick }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; icon: React.ReactNode; title: string; description?: string; onClick?: () => void }) {
    return (
        <button
            type="button"
            className="flex h-16 w-full cursor-pointer items-center gap-3 rounded-2xl px-3 text-left transition"
            style={{ color: theme.node.text }}
            onPointerDownCapture={(event) => event.stopPropagation()}
            onClick={(event) => {
                event.stopPropagation();
                onClick?.();
            }}
            onMouseEnter={(event) => (event.currentTarget.style.background = theme.node.fill)}
            onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
        >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ background: theme.node.fill, color: theme.node.muted }}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-base font-semibold leading-5">{title}</span>
                {description ? (
                    <span className="mt-1 block truncate text-sm" style={{ color: theme.node.muted }}>
                        {description}
                    </span>
                ) : null}
            </span>
        </button>
    );
}

function LeaferCanvasPage() {
    const { message, modal } = App.useApp();
    const params = useParams<{ id: string }>();
    const navigate = useNavigate();
    const projectId = params.id ?? "";
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasShellRef = useRef<HTMLElement>(null);
    const composerOverlayRef = useRef<HTMLDivElement>(null);
    const composerPanelRef = useRef<HTMLDivElement>(null);
    const dialogNodeRef = useRef<CanvasNodeData | null>(null);
    const composerHeightRef = useRef(360);
    const composerScrollRestoreRef = useRef<number | null>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetRef = useRef<{ nodeId?: string; position?: Position } | null>(null);
    const historyRef = useRef<{ past: CanvasHistoryEntry[]; future: CanvasHistoryEntry[] }>({ past: [], future: [] });
    const lastHistoryRef = useRef<CanvasHistoryEntry | null>(null);
    const historyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const projectSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const restoredProjectKeyRef = useRef("");
    const restoreGenerationRef = useRef(0);
    const applyingHistoryRef = useRef(false);
    const historyPausedRef = useRef(false);
    const didInitialCenterRef = useRef(false);
    const toolbarHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const nodeDraggingRef = useRef(false);
    const imageTapGestureRef = useRef<{ nodeId: string | null; count: number; lastAt: number; composerTimer: number | null }>({
        nodeId: null,
        count: 0,
        lastAt: 0,
        composerTimer: null,
    });

    const config = useConfigStore((state) => state.config);
    const comfyui = useConfigStore((state) => state.comfyui);
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const cleanupAssetImages = useAssetStore((state) => state.cleanupImages);
    const userHydrated = useUserStore((state) => state.hydrated);
    const user = useUserStore((state) => state.user);
    const token = useUserStore((state) => state.token);
    const saveMode = useUserStore((state) => state.saveMode);
    const workspaceStatus = useUserStore((state) => state.workspaceStatus);
    const backendWorkspaceReady = saveMode !== "backend" || (userHydrated && Boolean(user && token) && workspaceStatus === "ready");
    const backendWorkspaceBlocked = saveMode === "backend" && userHydrated && ((!user || !token) || workspaceStatus === "error");
    const canvasSessionExpired = useCanvasSingleOpenLock(projectId, backendWorkspaceReady);
    const openProject = useCanvasStore((state) => state.openProject);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const renameProject = useCanvasStore((state) => state.renameProject);
    const deleteProjects = useCanvasStore((state) => state.deleteProjects);
    const projectTitle = useCanvasStore((state) => {
        const p = state.projects.find((project) => project.id === projectId);
        return p?.title || "";
    });
    const [workflowTemplates, setWorkflowTemplates] = useState<CanvasWorkflowTemplate[]>([]);
    const workflowTemplatesRef = useRef(workflowTemplates);
    workflowTemplatesRef.current = workflowTemplates;
    const [workflowTemplatesLoading, setWorkflowTemplatesLoading] = useState(false);
    useEffect(() => {
        if (!backendWorkspaceReady || !token) return;
        let cancelled = false;
        setWorkflowTemplatesLoading(true);
        listCanvasTemplates(token)
            .then((items) => {
                if (!cancelled) setWorkflowTemplates(items);
            })
            .catch(() => {
                if (!cancelled) message.error("加载模板列表失败，请稍后重试");
            })
            .finally(() => {
                if (!cancelled) setWorkflowTemplatesLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [backendWorkspaceReady, token]);
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    useEffect(() => {
        const shell = canvasShellRef.current;
        if (!shell) return;
        const preventBrowserWheelZoom = (event: WheelEvent) => {
            if (event.ctrlKey || event.metaKey) event.preventDefault();
        };
        shell.addEventListener("wheel", preventBrowserWheelZoom, { capture: true, passive: false });
        // window 层兜底：覆盖 portal 到 document.body 的 antd 弹层（Popover/Modal）
        window.addEventListener("wheel", preventBrowserWheelZoom, { capture: true, passive: false });
        return () => {
            shell.removeEventListener("wheel", preventBrowserWheelZoom, { capture: true });
            window.removeEventListener("wheel", preventBrowserWheelZoom, { capture: true });
        };
    }, []);

    const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
    const [connections, setConnections] = useState<CanvasConnection[]>([]);
    const [chatSessions, setChatSessions] = useState<CanvasAssistantSession[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
    const [size, setSize] = useState({ width: 1200, height: 720 });
    const [selectedNodeIds, setSelectedNodeIdsState] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [connectingParams, setConnectingParams] = useState<ConnectionHandle | null>(null);
    const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<string | null>(null);
    const [pendingConnectionCreate, setPendingConnectionCreate] = useState<PendingConnectionCreate | null>(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const [highlightNodeId, setHighlightNodeId] = useState<string | null>(null);
    const highlightTimerRef = useRef<number | null>(null);
    const [mouseWorld, setMouseWorld] = useState<Position>({ x: 0, y: 0 });
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [createMenu, setCreateMenu] = useState<{ x: number; y: number; canvasPosition: Position } | null>(null);
    const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
    const [isMiniMapOpen, setIsMiniMapOpen] = useState(true);
    const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>("dots");
    const [snapToGrid, setSnapToGrid] = useState(false);
    const [alignmentGuidesEnabled, setAlignmentGuidesEnabled] = useState(true);
    const [alignmentGuides, setAlignmentGuides] = useState<CanvasAlignmentGuides | null>(null);
    const [showImageInfo, setShowImageInfo] = useState(false);
    const [showConnections, setShowConnections] = useState(true);
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [assetPickerTargetNodeId, setAssetPickerTargetNodeId] = useState<string | null>(null);
    const [canvasAssetPanelOpen, setCanvasAssetPanelOpen] = useState(false);
    const [workflowToolboxOpen, setWorkflowToolboxOpen] = useState(false);
    const [canvasAssetPanelInitialTab, setCanvasAssetPanelInitialTab] = useState<"canvas" | "assets">("canvas");
    const [generationHistoryOpen, setGenerationHistoryOpen] = useState(false);
    const [materialLibraryOpen, setMaterialLibraryOpen] = useState(false);
    const [materialLibraryTab, setMaterialLibraryTab] = useState<"styles" | "effects" | "assets">("styles");
    const [directorStudioNodeId, setDirectorStudioNodeId] = useState<string | null>(null);
    const [scriptStudioNodeId, setScriptStudioNodeId] = useState<string | null>(null);
    const [projectLoaded, setProjectLoaded] = useState(false);
    const [canvasVisualReady, setCanvasVisualReady] = useState(false);
    const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
    const [nodeImageSettingsOpen, setNodeImageSettingsOpen] = useState(false);
    const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
    const [editRequestNonce, setEditRequestNonce] = useState(0);
    const [infoNodeId, setInfoNodeId] = useState<string | null>(null);
    const [cropNodeId, setCropNodeId] = useState<string | null>(null);
    const [maskEditNodeId, setMaskEditNodeId] = useState<string | null>(null);
    const [splitNodeId, setSplitNodeId] = useState<string | null>(null);
    const [upscaleNodeId, setUpscaleNodeId] = useState<string | null>(null);
    const [angleNodeId, setAngleNodeId] = useState<string | null>(null);
    const [outpaintNodeId, setOutpaintNodeId] = useState<string | null>(null);
    const [lightingNodeId, setLightingNodeId] = useState<string | null>(null);
    const [imageToolDialogUrl, setImageToolDialogUrl] = useState("");
    const [trimVideoNodeId, setTrimVideoNodeId] = useState<string | null>(null);
    const [trimVideoSrc, setTrimVideoSrc] = useState("");
    const [compositionNodeId, setCompositionNodeId] = useState<string | null>(null);
    const [compositionSources, setCompositionSources] = useState<CompositionSource[]>([]);
    const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
    const [assistantCollapsed, setAssistantCollapsed] = useState(true);
    const [assistantMounted, setAssistantMounted] = useState(false);
    const [assistantClosing, setAssistantClosing] = useState(false);
    const [saveState, setSaveState] = useState<CanvasSaveState>("saved");
    const [showRecoveryNotice, setShowRecoveryNotice] = useState(false);
    const [agentMode, setAgentMode] = useState<CanvasAgentMode>("online");
    const [agentUndoStack, setAgentUndoStack] = useState<CanvasAgentSnapshot[]>([]);
    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");
    const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
    const [collapsingBatchIds, setCollapsingBatchIds] = useState<Set<string>>(new Set());
    const [openingBatchIds, setOpeningBatchIds] = useState<Set<string>>(new Set());
    const [isNodeDragging, setIsNodeDragging] = useState(false);
    const [nodeSequenceCounters, setNodeSequenceCounters] = useState<CanvasNodeSequenceCounters>({});
    const [referenceOrderCounter, setReferenceOrderCounter] = useState(0);
    const [composerContentHeight, setComposerContentHeight] = useState(360);

    const nodesRef = useRef(nodes);
    const connectionsRef = useRef(connections);
    const nodeSequenceCountersRef = useRef<CanvasNodeSequenceCounters>({});
    const referenceOrderCounterRef = useRef(0);
    const selectedNodeIdsRef = useRef(selectedNodeIds);
    const selectedConnectionIdRef = useRef(selectedConnectionId);
    const nodeByIdRef = useRef<Map<string, CanvasNodeData>>(new Map());
    const hiddenBatchChildIdsRef = useRef<Set<string>>(new Set());
    const viewportRef = useRef(viewport);
    const snapToGridRef = useRef(snapToGrid);
    snapToGridRef.current = snapToGrid;
    const alignmentGuidesEnabledRef = useRef(alignmentGuidesEnabled);
    alignmentGuidesEnabledRef.current = alignmentGuidesEnabled;
    const lastCanvasPositionRef = useRef<Position | null>(null);
    const generateNodeRef = useRef<((nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => Promise<void>) | null>(null);
    const retryNodeRef = useRef<((node: CanvasNodeData) => void) | null>(null);
    /** Agent 副作用 op 分发器：在所有画布 handler 定义完之后赋值（见 handleExecuteGroup 之后）。 */
    const agentOpsDispatcherRef = useRef<(sideEffectOps: CanvasAgentOp[], configPatchOps: Extract<CanvasAgentOp, { type: "update_node" }>[]) => Promise<Record<string, unknown>>>(async () => ({}));
    const connectingParamsRef = useRef(connectingParams);
    const connectionTargetNodeIdRef = useRef(connectionTargetNodeId);
    const agentCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingConnectionCreateRef = useRef(pendingConnectionCreate);
    const generationRequestsRef = useRef(new Map<string, CanvasGenerationRequest>());
    const recoveredVideoTaskIdsRef = useRef(new Set<string>());
    const recoveryTrackingStartedRef = useRef(false);
    const resumedGenerationProjectKeyRef = useRef<string | null>(null);
    const groupExecutionRunningRef = useRef(false);
    const multiNodeDragStartRef = useRef<MultiNodeDragState | null>(null);
    const setSelectedNodeIds = useCallback((nextValue: Set<string> | ((current: Set<string>) => Set<string>)) => {
        const next = typeof nextValue === "function" ? nextValue(selectedNodeIdsRef.current) : nextValue;
        selectedNodeIdsRef.current = next;
        setSelectedNodeIdsState(next);
    }, []);

    const createCanvasNode = useCallback((type: CanvasNodeType, position: Position, metadata?: CanvasNodeMetadata): CanvasNodeData => {
        const identity = allocateCanvasNodeIdentity(type, nodeSequenceCountersRef.current);
        nodeSequenceCountersRef.current = identity.nodeSequenceCounters;
        setNodeSequenceCounters(identity.nodeSequenceCounters);

        const node = createCanvasNodeBase(type, position, {
            ...metadata,
            typeSequence: identity.typeSequence,
            ...(type === CanvasNodeType.ComfyUI ? { generationMode: "comfyui" } : null),
        });
        return {
            ...node,
            position: snapToGridRef.current ? snapCanvasPosition(node.position) : node.position,
            title: identity.title,
        };
    }, []);

    const createCanvasConnection = useCallback((fromNodeId: string, toNodeId: string): CanvasConnection => {
        const referenceOrder = referenceOrderCounterRef.current + 1;
        referenceOrderCounterRef.current = referenceOrder;
        setReferenceOrderCounter(referenceOrder);
        return { id: nanoid(), fromNodeId, toNodeId, referenceOrder };
    }, []);

    const resetImageTapGesture = useCallback(() => {
        const gesture = imageTapGestureRef.current;
        if (gesture.composerTimer) window.clearTimeout(gesture.composerTimer);
        imageTapGestureRef.current = { nodeId: null, count: 0, lastAt: 0, composerTimer: null };
    }, []);

    useEffect(() => () => resetImageTapGesture(), [resetImageTapGesture]);

    const createHistoryEntry = useCallback(
        (): CanvasHistoryEntry => ({
            nodes: nodesRef.current,
            connections: connectionsRef.current,
            chatSessions,
            activeChatId,
            backgroundMode,
            snapToGrid,
            alignmentGuidesEnabled,
            showImageInfo,
            showConnections,
        }),
        [activeChatId, alignmentGuidesEnabled, backgroundMode, chatSessions, showConnections, showImageInfo, snapToGrid],
    );

    const cleanupCanvasFiles = useCallback(
        (extra?: unknown) => {
            cleanupAssetImages({ extra, history: historyRef.current, lastHistory: lastHistoryRef.current });
        },
        [cleanupAssetImages],
    );

    const startGenerationRequest = useCallback((targetNodeId: string, originNodeId: string, runningId = originNodeId, controller = new AbortController()) => {
        const previous = generationRequestsRef.current.get(targetNodeId);
        if (previous?.controller !== controller) previous?.controller.abort();
        generationRequestsRef.current.set(targetNodeId, { targetNodeId, originNodeId, runningNodeId: runningId, controller });
        return controller;
    }, []);

    const finishGenerationRequest = useCallback((targetNodeId: string, controller: AbortController) => {
        const request = generationRequestsRef.current.get(targetNodeId);
        if (request?.controller === controller) generationRequestsRef.current.delete(targetNodeId);
    }, []);

    const finishCanvasVideoTask = useCallback(
        async (nodeId: string, generationConfig: AiConfig, task: VideoGenerationTask, startedAt: number, controller: AbortController) => {
            let providerTaskCompleted = false;
            try {
                const result = await waitForVideoGenerationTask(generationConfig, task, {
                    signal: controller.signal,
                    generationMode: nodesRef.current.find((node) => node.id === nodeId)?.metadata?.videoGenerationMode,
                    startedAt,
                    onDownloadStart: () => {
                        // 视频已在上游生成完成，正在下载文件（Junli 等 CDN 下载可能较慢）。
                        setNodes((prev) =>
                            prev.map((node) =>
                                node.id === nodeId
                                    ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_LOADING, videoDownloading: true, errorDetails: undefined } }
                                    : node,
                            ),
                        );
                    },
                });
                providerTaskCompleted = true;
                const video = await storeGeneratedVideo(result);
                setNodes((prev) =>
                    prev.map((node) => {
                        if (node.id !== nodeId) return node;
                        const videoSize = fitNodeSize(video.width || node.width, video.height || node.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                        return {
                            ...node,
                            width: videoSize.width,
                            height: videoSize.height,
                            position: { x: node.position.x + node.width / 2 - videoSize.width / 2, y: node.position.y + node.height / 2 - videoSize.height / 2 },
                            metadata: { ...node.metadata, ...videoMetadata(video), generationJobId: undefined, videoTask: undefined, videoTaskStartedAt: undefined, videoDownloading: undefined, errorDetails: undefined },
                        };
                    }),
                );
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "视频生成失败";
                if (providerTaskCompleted) recoveredVideoTaskIdsRef.current.add(nodeId);
                setNodes((prev) => prev.map((node) => (
                    node.id === nodeId
                        ? {
                              ...node,
                              metadata: {
                                  ...node.metadata,
                                  status: NODE_STATUS_ERROR,
                                  videoDownloading: undefined,
                                  errorDetails: providerTaskCompleted ? `视频已生成，但保存到素材库失败：${errorDetails}。重新打开画布会自动恢复。` : errorDetails,
                                  ...(providerTaskCompleted ? null : { videoTask: undefined, videoTaskStartedAt: undefined }),
                              },
                          }
                        : node
                )));
                message.error(errorDetails);
            } finally {
                finishGenerationRequest(nodeId, controller);
            }
        },
        [finishGenerationRequest, message],
    );

    const saveCanvasVideoTask = useCallback(
        async (nodeId: string, task: VideoGenerationTask, startedAt: number) => {
            const applyVideoTask = (nodes: CanvasNodeData[]) =>
                nodes.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, videoTask: task, videoTaskStartedAt: startedAt, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node));
            setNodes((prev) => {
                const next = applyVideoTask(prev);
                nodesRef.current = next;
                return next;
            });
            nodesRef.current = applyVideoTask(nodesRef.current);
            updateProject(projectId, { nodes: nodesRef.current });
            if (saveMode === "backend" && token) {
                try {
                    const latest = useCanvasStore.getState();
                    await pushBackendProjects(token, latest.projects, latest.projectTombstones);
                } catch (error) {
                    console.warn("[canvas-video] pending task save will retry through workspace sync", error);
                }
            }
        },
        [projectId, saveMode, token, updateProject],
    );

    const saveCanvasGenerationJobs = useCallback(
        async (jobs: ReadonlyMap<string, string>) => {
            if (!jobs.size) return;
            const startedAt = Date.now();
            const applyGenerationJobs = (nodes: CanvasNodeData[]) =>
                nodes.map((node) => {
                    const generationJobId = jobs.get(node.id);
                    return generationJobId
                        ? {
                              ...node,
                              metadata: {
                                  ...node.metadata,
                                  generationJobId,
                                  status: NODE_STATUS_LOADING,
                                  errorDetails: undefined,
                                  generationRuns: upsertCanvasGenerationRun(node.metadata?.generationRuns, {
                                      id: generationJobId,
                                      status: "running",
                                      startedAt: node.metadata?.generationRuns?.find((run) => run.id === generationJobId)?.startedAt || startedAt,
                                      updatedAt: startedAt,
                                      prompt: node.metadata?.requestPrompt || node.metadata?.prompt || node.metadata?.composerContent,
                                      model: node.metadata?.model,
                                      mode: node.metadata?.generationMode,
                                      errorDetails: undefined,
                                  }),
                              },
                          }
                        : node;
                });
            setNodes((prev) => {
                const next = applyGenerationJobs(prev);
                nodesRef.current = next;
                return next;
            });
            nodesRef.current = applyGenerationJobs(nodesRef.current);
            updateProject(projectId, { nodes: nodesRef.current });
            if (saveMode === "backend" && token) {
                try {
                    const latest = useCanvasStore.getState();
                    await pushBackendProjects(token, latest.projects, latest.projectTombstones);
                } catch (error) {
                    console.warn("[canvas-generation] pending job save will retry through workspace sync", error);
                }
            }
        },
        [projectId, saveMode, token, updateProject],
    );

    // 兜底结算器：各生成完成路径只更新 node.metadata.status（终态），
    // 不结算 generationRuns 中的 running 记录；本 effect 在 nodes 变化时
    // 把已结束但未结算的 run 标记为终态。纯函数式 updater，无变化时返回原引用，
    // 不会产生重渲染环。
    const generationSettlementKey = useMemo(() => generationRunSettlementKey(nodes), [nodes]);
    useEffect(() => {
        if (!generationSettlementKey) return;
        setNodes((prev) => settleFinishedGenerationRuns(prev));
    }, [generationSettlementKey]);

    const stopGenerationByRunningId = useCallback((runningId: string) => {
        const affectedNodeIds = new Set<string>();
        generationRequestsRef.current.forEach((request) => {
            if (request.runningNodeId !== runningId) return;
            request.controller.abort();
            generationRequestsRef.current.delete(request.targetNodeId);
            affectedNodeIds.add(request.targetNodeId);
            affectedNodeIds.add(request.originNodeId);
        });
        setRunningNodeId((current) => (current === runningId ? null : current));
        if (!affectedNodeIds.size) return;
        setNodes((prev) =>
            prev.map((node) =>
                affectedNodeIds.has(node.id) && node.metadata?.status === NODE_STATUS_LOADING
                    ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_IDLE, errorDetails: undefined, ...(node.type === CanvasNodeType.Video ? { videoTask: undefined, videoTaskStartedAt: undefined } : null) } }
                    : node,
            ),
        );
    }, []);

    const confirmStopGeneration = useCallback(
        (nodeId: string) => {
            modal.confirm({
                title: "停止生成？",
                content: "当前生成请求会被中断，已经生成完成的内容会保留。",
                okText: "停止",
                cancelText: "继续生成",
                okButtonProps: { danger: true },
                onOk: () => stopGenerationByRunningId(nodeId),
            });
        },
        [modal, stopGenerationByRunningId],
    );

    useLayoutEffect(() => {
        if (!backendWorkspaceReady || canvasSessionExpired) return;
        const restoreKey = `${saveMode}:${user?.id || "anonymous"}:${projectId}`;
        if (restoredProjectKeyRef.current === restoreKey) return;

        const restoreGeneration = restoreGenerationRef.current + 1;
        restoreGenerationRef.current = restoreGeneration;
        let cancelled = false;
        setProjectLoaded(false);
        setCanvasVisualReady(false);
        const project = openProject(projectId);
        if (!project) {
            navigate("/canvas", { replace: true });
            return;
        }

        const restore = async () => {
            const currentGenerationNodeIds = new Set<string>();
            generationRequestsRef.current.forEach((request) => {
                currentGenerationNodeIds.add(request.targetNodeId);
                currentGenerationNodeIds.add(request.originNodeId);
            });
            const sourceNodes = currentGenerationNodeIds.size ? project.nodes : resetInterruptedGeneration(project.nodes);
            const restoredNodes = await hydrateCanvasImages(sourceNodes).then((items) => {
                const merged = currentGenerationNodeIds.size ? mergeActiveGenerationNodes(items, nodesRef.current, currentGenerationNodeIds) : items;
                const comfySize = NODE_DEFAULT_SIZE[CanvasNodeType.ComfyUI];
                return merged.map((node) => node.type === CanvasNodeType.ComfyUI && (node.width !== comfySize.width || node.height !== comfySize.height)
                    ? { ...node, width: comfySize.width, height: comfySize.height }
                    : node);
            });
            const restoredSessions = await hydrateAssistantImages(project.chatSessions || []);
            if (cancelled || restoreGenerationRef.current !== restoreGeneration) return;

            const restoredNodeSequenceCounters = { ...project.nodeSequenceCounters };
            nodeSequenceCountersRef.current = restoredNodeSequenceCounters;
            referenceOrderCounterRef.current = project.referenceOrderCounter;
            setNodes(restoredNodes);
            setConnections(project.connections);
            setNodeSequenceCounters(restoredNodeSequenceCounters);
            setReferenceOrderCounter(project.referenceOrderCounter);
            setChatSessions(restoredSessions);
            setActiveChatId(project.activeChatId || null);
            setBackgroundMode(project.backgroundMode);
            setSnapToGrid(project.snapToGrid || false);
            setAlignmentGuidesEnabled(project.alignmentGuidesEnabled !== false);
            setShowImageInfo(project.showImageInfo || false);
            setShowConnections(project.showConnections !== false);
            setViewport({ ...project.viewport, k: clampCanvasZoom(project.viewport.k) });
            historyRef.current = { past: [], future: [] };
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
            lastHistoryRef.current = {
                nodes: restoredNodes,
                connections: project.connections,
                chatSessions: restoredSessions,
                activeChatId: project.activeChatId || null,
                backgroundMode: project.backgroundMode,
                snapToGrid: project.snapToGrid || false,
                alignmentGuidesEnabled: project.alignmentGuidesEnabled !== false,
                showImageInfo: project.showImageInfo || false,
                showConnections: project.showConnections !== false,
            };
            restoredProjectKeyRef.current = restoreKey;
            setHistoryState({ canUndo: false, canRedo: false });
            setProjectLoaded(true);
        };
        void restore();
        return () => {
            cancelled = true;
            if (restoreGenerationRef.current === restoreGeneration) restoreGenerationRef.current += 1;
        };
    }, [backendWorkspaceReady, canvasSessionExpired, navigate, openProject, projectId, saveMode, user?.id]);

    useEffect(() => {
        if (!projectLoaded || applyingHistoryRef.current || historyPausedRef.current) return;
        const next = createHistoryEntry();
        const previous = lastHistoryRef.current;
        if (
            previous?.nodes === next.nodes &&
            previous.connections === next.connections &&
            previous.chatSessions === next.chatSessions &&
            previous.activeChatId === next.activeChatId &&
            previous.backgroundMode === next.backgroundMode &&
            previous.snapToGrid === next.snapToGrid &&
            previous.alignmentGuidesEnabled === next.alignmentGuidesEnabled &&
            previous.showImageInfo === next.showImageInfo &&
            previous.showConnections === next.showConnections
        )
            return;

        if (historyCommitTimerRef.current) clearTimeout(historyCommitTimerRef.current);
        historyCommitTimerRef.current = setTimeout(() => {
            const current = createHistoryEntry();
            const last = lastHistoryRef.current;
            if (!last) return;
            historyRef.current.past = [...historyRef.current.past.slice(-49), last];
            historyRef.current.future = [];
            setHistoryState({ canUndo: true, canRedo: false });
            lastHistoryRef.current = current;
            historyCommitTimerRef.current = null;
        }, 180);

        return () => {
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
        };
    }, [activeChatId, alignmentGuidesEnabled, backgroundMode, chatSessions, connections, createHistoryEntry, nodes, projectLoaded, showConnections, showImageInfo, snapToGrid]);

    useEffect(() => {
        if (!projectLoaded) return;
        nodes.forEach((node) => {
            const task = node.type === CanvasNodeType.Video ? node.metadata?.videoTask : undefined;
            const startedAt = node.metadata?.videoTaskStartedAt;
            if (!task || !startedAt || generationRequestsRef.current.has(node.id) || recoveredVideoTaskIdsRef.current.has(node.id)) return;
            recoveredVideoTaskIdsRef.current.add(node.id);
            const controller = startGenerationRequest(node.id, node.id, node.id);
            setRunningNodeId(node.id);
            setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined } } : item)));
            void finishCanvasVideoTask(node.id, { ...buildGenerationConfig(effectiveConfig, node, "video"), model: task.model }, task, startedAt, controller).finally(() => setRunningNodeId((current) => (current === node.id ? null : current)));
        });
    }, [effectiveConfig, finishCanvasVideoTask, nodes, projectLoaded, startGenerationRequest]);

    useEffect(
        () => () => {
            if (agentCloseTimerRef.current) clearTimeout(agentCloseTimerRef.current);
        },
        [],
    );

    useEffect(() => {
        if (!projectLoaded || historyPausedRef.current) return;
        setSaveState("saving");
        if (projectSaveTimerRef.current) clearTimeout(projectSaveTimerRef.current);
        projectSaveTimerRef.current = setTimeout(() => {
            projectSaveTimerRef.current = null;
            updateProject(projectId, { nodes, connections, nodeSequenceCounters, referenceOrderCounter, chatSessions, activeChatId, backgroundMode, snapToGrid, alignmentGuidesEnabled, showImageInfo, showConnections });
            setSaveState("saved");
        }, 300);
        return () => {
            if (projectSaveTimerRef.current) {
                clearTimeout(projectSaveTimerRef.current);
                projectSaveTimerRef.current = null;
            }
        };
    }, [activeChatId, alignmentGuidesEnabled, backgroundMode, chatSessions, connections, nodeSequenceCounters, nodes, projectId, projectLoaded, referenceOrderCounter, showConnections, showImageInfo, snapToGrid, updateProject]);

    // 后端工作区不可用时标记「离线」，恢复后回到已保存态。
    useEffect(() => {
        if (workspaceStatus === "error") setSaveState("offline");
        else setSaveState((current) => (current === "offline" ? "saved" : current));
    }, [workspaceStatus]);

    const retrySave = useCallback(async () => {
        setSaveState("saving");
        updateProject(projectId, { nodes, connections, nodeSequenceCounters, referenceOrderCounter, chatSessions, activeChatId, backgroundMode, snapToGrid, alignmentGuidesEnabled, showImageInfo, showConnections });
        if (saveMode === "backend" && token) {
            try {
                const latest = useCanvasStore.getState();
                await pushBackendProjects(token, latest.projects, latest.projectTombstones);
                setSaveState("saved");
            } catch {
                setSaveState("error");
            }
        } else {
            setSaveState("saved");
        }
    }, [activeChatId, alignmentGuidesEnabled, backgroundMode, chatSessions, connections, nodeSequenceCounters, nodes, projectId, referenceOrderCounter, saveMode, showConnections, showImageInfo, snapToGrid, token, updateProject]);

    useEffect(() => {
        if (!projectLoaded) return;
        const key = canvasRecoveryMarkerKey(user?.id, projectId);
        setShowRecoveryNotice(readCanvasRecoveryMarker(key));
        recoveryTrackingStartedRef.current = false;
        return () => {
            recoveryTrackingStartedRef.current = false;
        };
    }, [projectId, projectLoaded, user?.id]);

    useEffect(() => {
        if (!projectLoaded) return;
        if (!recoveryTrackingStartedRef.current) {
            recoveryTrackingStartedRef.current = true;
            return;
        }
        writeCanvasRecoveryMarker(canvasRecoveryMarkerKey(user?.id, projectId), true);
    }, [activeChatId, alignmentGuidesEnabled, backgroundMode, chatSessions, connections, nodes, projectId, projectLoaded, showImageInfo, snapToGrid, user?.id]);

    useEffect(() => {
        if (!projectLoaded) return;
        const markerKey = canvasRecoveryMarkerKey(user?.id, projectId);
        const flushCanvasNodes = () => {
            updateProject(projectId, {
                nodes: nodesRef.current,
                connections: connectionsRef.current,
                nodeSequenceCounters: nodeSequenceCountersRef.current,
                referenceOrderCounter: referenceOrderCounterRef.current,
            });
            writeCanvasRecoveryMarker(markerKey, false);
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") flushCanvasNodes();
        };
        document.addEventListener("visibilitychange", handleVisibilityChange, true);
        window.addEventListener("pagehide", flushCanvasNodes, true);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange, true);
            window.removeEventListener("pagehide", flushCanvasNodes, true);
            flushCanvasNodes();
        };
    }, [projectId, projectLoaded, updateProject, user?.id]);

    useEffect(() => {
        if (!dialogNodeId) setNodeImageSettingsOpen(false);
    }, [dialogNodeId]);

    useEffect(() => {
        if (!projectLoaded) return;
        if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        viewportSaveTimerRef.current = setTimeout(() => {
            updateProject(projectId, { viewport: viewportRef.current });
            viewportSaveTimerRef.current = null;
        }, 500);
        return () => {
            if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        };
    }, [projectId, projectLoaded, updateProject, viewport]);

    useLayoutEffect(() => {
        nodesRef.current = nodes;
        connectionsRef.current = connections;
        selectedConnectionIdRef.current = selectedConnectionId;
        viewportRef.current = viewport;
        connectingParamsRef.current = connectingParams;
        connectionTargetNodeIdRef.current = connectionTargetNodeId;
        pendingConnectionCreateRef.current = pendingConnectionCreate;
    }, [nodes, connections, selectedNodeIds, selectedConnectionId, viewport, connectingParams, connectionTargetNodeId, pendingConnectionCreate]);

    useEffect(() => {
        if (!projectLoaded) return;
        const el = containerRef.current;
        if (!el) return;

        const updateSize = () => {
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            setSize((current) => (current.width === rect.width && current.height === rect.height ? current : { width: rect.width, height: rect.height }));
            if (!didInitialCenterRef.current) {
                didInitialCenterRef.current = true;
                setViewport((current) => {
                    if (current.x !== 0 || current.y !== 0 || current.k !== 1) return current;
                    const next = { x: rect.width / 2, y: rect.height / 2, k: 1 };
                    viewportRef.current = next;
                    return current.x === next.x && current.y === next.y && current.k === next.k ? current : next;
                });
            }
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, [projectLoaded]);

    const screenToCanvas = useCallback((clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const currentViewport = viewportRef.current;
        const localX = clientX - (rect?.left || 0);
        const localY = clientY - (rect?.top || 0);

        return {
            x: (localX - currentViewport.x) / currentViewport.k,
            y: (localY - currentViewport.y) / currentViewport.k,
        };
    }, []);

    const getCanvasCenter = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        return screenToCanvas((rect?.left || 0) + (rect?.width || size.width) / 2, (rect?.top || 0) + (rect?.height || size.height) / 2);
    }, [screenToCanvas, size.height, size.width]);

    const canvasToScreen = useCallback((position: Position) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const current = viewportRef.current;
        return {
            x: (rect?.left || 0) + position.x * current.k + current.x,
            y: (rect?.top || 0) + position.y * current.k + current.y,
        };
    }, [containerRef]);

    const setConnecting = useCallback((next: ConnectionHandle | null) => {
        connectingParamsRef.current = next;
        setConnectingParams(next);
        if (!next) {
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
        }
    }, []);

    const keepNodeToolbar = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current || nodeImageSettingsOpen) return;
            if (toolbarHideTimerRef.current) {
                clearTimeout(toolbarHideTimerRef.current);
                toolbarHideTimerRef.current = null;
            }
            setToolbarNodeId(nodeId);
        },
        [nodeImageSettingsOpen],
    );

    const hideNodeToolbar = useCallback(() => {
        if (toolbarHideTimerRef.current) clearTimeout(toolbarHideTimerRef.current);
        toolbarHideTimerRef.current = setTimeout(() => {
            setToolbarNodeId(null);
            toolbarHideTimerRef.current = null;
        }, NODE_TOOLBAR_HIDE_DELAY_MS);
    }, []);

    useEffect(() => () => {
        if (toolbarHideTimerRef.current) clearTimeout(toolbarHideTimerRef.current);
    }, []);

    const nodeById = useMemo(() => buildNodeById(nodes), [nodes]);
    const batchVisibilityIndex = useMemo(() => buildBatchVisibilityIndex(nodes, nodeById, collapsingBatchIds), [collapsingBatchIds, nodeById, nodes]);
    const connectionAdjacency = useMemo(() => buildConnectionAdjacency(connections), [connections]);
    const mountedNodeItems = useMemo(
        () => nodes.filter((node) => !batchVisibilityIndex.hiddenBatchChildIds.has(node.id)).sort((a, b) => (a.type === CanvasNodeType.Group ? 0 : 1) - (b.type === CanvasNodeType.Group ? 0 : 1)),
        [batchVisibilityIndex, nodes],
    );
    const canvasGraph = useMemo(() => createCanvasResourceGraph(nodes, connections, nodeById), [connections, nodeById, nodes]);
    const nodeRelationCounts = useMemo(
        () => new Map(nodes.map((node) => [node.id, { input: canvasGraph.incomingByNodeId.get(node.id)?.length || 0, output: canvasGraph.outgoingByNodeId.get(node.id)?.length || 0 }])),
        [canvasGraph, nodes],
    );

    useLayoutEffect(() => {
        nodeByIdRef.current = nodeById;
        hiddenBatchChildIdsRef.current = batchVisibilityIndex.hiddenBatchChildIds;
    }, [batchVisibilityIndex, nodeById]);

    const connectNodes = useCallback(
        (current: ConnectionHandle, targetNodeId: string) => {
            if (current.nodeId === targetNodeId) return;

            const connection = normalizeConnectionWithNodeMap(current.nodeId, targetNodeId, nodeByIdRef.current, current.handleType);
            if (!connection) {
                message.warning("配置节点之间不能连接");
                return;
            }
            const { fromNodeId, toNodeId } = connection;
            const exists = connectionsRef.current.some((conn) => conn.fromNodeId === fromNodeId && conn.toNodeId === toNodeId);
            if (!exists) {
                setConnections((prev) => [...prev, createCanvasConnection(fromNodeId, toNodeId)]);
            }
            connectingParamsRef.current = null;
            setConnecting(null);
            setPendingConnectionCreate(null);
            setConnectionTargetNodeId(null);
            connectionTargetNodeIdRef.current = null;
            setContextMenu(null);
        },
        [createCanvasConnection, message, setConnecting],
    );

    const handleLeaferConnect = useCallback(
        (fromNodeId: string, toNodeId: string) => {
            const startedFrom = connectingParamsRef.current;
            const startHandleType = startedFrom?.handleType || "source";
            connectNodes({ nodeId: fromNodeId, handleType: startHandleType }, toNodeId);
        },
        [connectNodes],
    );

    const handleLeaferConnectStart = useCallback(
        (nodeId: string, handleType: "source" | "target") => {
            const nextConnection = { nodeId, handleType };
            connectingParamsRef.current = nextConnection;
            setConnecting(nextConnection);
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
            setSelectedConnectionId(null);
            setPendingConnectionCreate(null);
        },
        [setConnecting],
    );

    const handleLeaferConnectEnd = useCallback((canvasPos?: { x: number; y: number }) => {
        const currentConnection = connectingParamsRef.current;
        connectingParamsRef.current = null;
        setConnecting(null);
        if (canvasPos && currentConnection) {
            // Dropped on empty space → show "create node" menu
            setMouseWorld(canvasPos);
            setPendingConnectionCreate({ connection: currentConnection, position: canvasPos });
        }
    }, [setConnecting]);

    const handleLeaferNodeDragStart = useCallback((nodeId: string) => {
        historyPausedRef.current = true;
        nodeDraggingRef.current = true;
        setIsNodeDragging(true);
        setAlignmentGuides(null);
        const anchor = nodeByIdRef.current.get(nodeId);
        if (!anchor) return;
        const movingIds = selectedNodeIdsRef.current.has(nodeId)
            ? new Set(selectedNodeIdsRef.current)
            : new Set([nodeId]);
        for (const id of Array.from(movingIds)) {
            const node = nodeByIdRef.current.get(id);
            if (node?.type === CanvasNodeType.Group) {
                for (const childId of node.metadata?.groupChildIds || []) movingIds.add(childId);
            }
        }
        multiNodeDragStartRef.current = {
            anchorId: nodeId,
            anchorPosition: { ...anchor.position },
            nodePositions: new Map(nodesRef.current.filter((item) => movingIds.has(item.id)).map((item) => [item.id, { ...item.position }])),
        };
    }, []);

    const resolveDraggedPosition = useCallback((nodeId: string, position: Position) => {
        const alignment = alignmentGuidesEnabledRef.current
            ? resolveNodeAlignment(nodeId, position, nodesRef.current, multiNodeDragStartRef.current, viewportRef.current.k)
            : { position, guides: null };
        const next = { ...alignment.position };
        if (snapToGridRef.current) {
            const gridPosition = snapCanvasPosition(next);
            if (alignment.guides?.vertical === undefined) next.x = gridPosition.x;
            if (alignment.guides?.horizontal === undefined) next.y = gridPosition.y;
        }
        setAlignmentGuides((current) => (sameAlignmentGuides(current, alignment.guides) ? current : alignment.guides));
        return next;
    }, []);

    const handleAlignmentGuidesEnabledChange = useCallback((enabled: boolean) => {
        setAlignmentGuidesEnabled(enabled);
        if (!enabled) setAlignmentGuides(null);
    }, []);

    const createConnectedNode = useCallback(
        (type: CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.ComfyUI | CanvasNodeType.Video | CanvasNodeType.Audio, pending: PendingConnectionCreate) => {
            const newNode = createCanvasNode(type, pending.position);
            const connection = normalizeConnectionWithNodeMap(pending.connection.nodeId, newNode.id, buildNodeById([...nodesRef.current, newNode]), pending.connection.handleType);
            if (!connection) {
                message.warning("配置节点之间不能连接");
                return;
            }
            setNodes((prev) => [...prev, newNode]);
            setConnections((prev) => [...prev, createCanvasConnection(connection.fromNodeId, connection.toNodeId)]);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(newNode.id);
            setPendingConnectionCreate(null);
            connectingParamsRef.current = null;
            setConnecting(null);
        },
        [createCanvasConnection, createCanvasNode, message, setConnecting],
    );

    const cancelPendingConnectionCreate = useCallback(() => {
        setPendingConnectionCreate(null);
        connectingParamsRef.current = null;
        setConnecting(null);
    }, [setConnecting]);

    const quickCreateFromEmpty = useCallback(
        (type: CanvasNodeType, metadata?: CanvasNodeMetadata) => {
            const shellRect = canvasShellRef.current?.getBoundingClientRect();
            const width = shellRect?.width ?? 800;
            const height = shellRect?.height ?? 600;
            const center = {
                x: (width / 2 - viewport.x) / viewport.k - 120,
                y: (height / 2 - viewport.y) / viewport.k - 80,
            };
            const node = createCanvasNode(type, center, metadata);
            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setContextMenu(null);
            setEditingNodeId(null);
            // 节点挂载流程会在挂载完成后约 50ms 内清理 dialogNodeId（与点击节点打开的时序竞争），
            // 立即设置会在节点挂载后被清掉。实测节点挂载约 200-400ms，延迟 400ms 越过清理窗口后
            // 打开 Composer，保证快捷创建后面板稳定弹出（慢设备上若偶发未弹出，点击节点可打开）。
            window.setTimeout(() => setDialogNodeId(node.id), 400);
        },
        [createCanvasNode, viewport],
    );

    const infoNode = infoNodeId ? nodeById.get(infoNodeId) || null : null;
    const cropNode = cropNodeId ? nodeById.get(cropNodeId) || null : null;
    const maskEditNode = maskEditNodeId ? nodeById.get(maskEditNodeId) || null : null;
    const splitNode = splitNodeId ? nodeById.get(splitNodeId) || null : null;
    const upscaleNode = upscaleNodeId ? nodeById.get(upscaleNodeId) || null : null;
    const angleNode = angleNodeId ? nodeById.get(angleNodeId) || null : null;
    const outpaintNode = outpaintNodeId ? nodeById.get(outpaintNodeId) || null : null;
    const lightingNode = lightingNodeId ? nodeById.get(lightingNodeId) || null : null;
    const trimVideoNode = trimVideoNodeId ? nodeById.get(trimVideoNodeId) || null : null;
    const compositionNode = compositionNodeId ? nodeById.get(compositionNodeId) || null : null;
    const previewNode = previewNodeId ? nodeById.get(previewNodeId) || null : null;
    const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
    const activeNodeId = hasMultipleSelectedNodes ? null : selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null;
    const toolbarNode = toolbarNodeId
        ? nodeById.get(toolbarNodeId) || null
        : activeNodeId
          ? nodeById.get(activeNodeId) || null
          : null;
    const selectedNodeOwnsToolbar = Boolean(
        toolbarNode
        && selectedNodeIds.has(toolbarNode.id)
        && (
            toolbarNode.type === CanvasNodeType.Text
            || (
                (toolbarNode.type === CanvasNodeType.Image || toolbarNode.type === CanvasNodeType.Video || toolbarNode.type === CanvasNodeType.Audio)
                && !toolbarNode.metadata?.content
                && !toolbarNode.metadata?.storageKey
                && toolbarNode.metadata?.status !== NODE_STATUS_LOADING
                && toolbarNode.metadata?.status !== NODE_STATUS_ERROR
            )
        ),
    );
    // 拆成两个独立 useMemo：
    // batchChildCountById/batchMotionById 依赖 nodes（含位置），每次拖拽都会重算，但计算量很小。
    // configInputsById/configInputSummaryById 依赖 canvasGraph（含连接关系），
    // 只有连接变化时才会重算，避免拖拽时触发昂贵的 graph 遍历。
    const { batchChildCountById, batchMotionById } = useMemo(() => {
        const batchChildCountById = new Map<string, number>();
        const batchMotionById = new Map<string, { x: number; y: number; index: number }>();
        for (const node of nodes) {
            if (node.metadata?.isBatchRoot) batchChildCountById.set(node.id, node.metadata.batchChildIds?.length || 0);
            const rootId = node.metadata?.batchRootId;
            if (rootId) {
                const root = nodeById.get(rootId);
                const index = root?.metadata?.batchChildIds?.indexOf(node.id) ?? 0;
                const stackX = root ? root.position.x + 34 + index * 14 : node.position.x;
                const stackY = root ? root.position.y + 14 + index * 8 : node.position.y;
                batchMotionById.set(node.id, { x: stackX - node.position.x, y: stackY - node.position.y, index: Math.max(index, 0) });
            }
        }
        return { batchChildCountById, batchMotionById };
    }, [nodeById, nodes]);

    const { configInputsById, configInputSummaryById } = useMemo(() => {
        const configInputsById = new Map<string, NodeGenerationInput[]>();
        const configInputSummaryById = new Map<string, ReturnType<typeof getInputSummary>>();
        for (const node of nodes) {
            if (isGenerationConfigNode(node.type)) {
                const inputs = buildNodeGenerationInputs(node.id, canvasGraph);
                configInputsById.set(node.id, inputs);
                configInputSummaryById.set(node.id, getInputSummary(inputs));
            }
        }
        return { configInputsById, configInputSummaryById };
    }, [canvasGraph, nodes]);
    const mentionReferencesByNodeId = useMemo(() => {
        const targetNodeIds = new Set<string>();
        mountedNodeItems.forEach((node) => {
            if (node.type === CanvasNodeType.Text || isGenerationConfigNode(node.type)) targetNodeIds.add(node.id);
        });
        [dialogNodeId, activeNodeId, editingNodeId, toolbarNodeId].forEach((nodeId) => {
            if (nodeId) targetNodeIds.add(nodeId);
        });

        const mentionReferencesByNodeId = new Map<string, ReturnType<typeof buildNodeMentionReferences>>();
        targetNodeIds.forEach((nodeId) => {
            const node = nodeById.get(nodeId);
            if (node) mentionReferencesByNodeId.set(nodeId, buildNodeMentionReferences(node, canvasGraph));
        });
        return mentionReferencesByNodeId;
    }, [activeNodeId, canvasGraph, dialogNodeId, editingNodeId, mountedNodeItems, nodeById, toolbarNodeId]);
    const relatedHighlight = useMemo(() => {
        const nodeIds = new Set<string>();
        const connectionIds = new Set<string>();

        if (!activeNodeId) return { nodeIds, connectionIds };

        nodeIds.add(activeNodeId);
        const relatedConnections = [...(connectionAdjacency.incomingByNodeId.get(activeNodeId) || []), ...(connectionAdjacency.outgoingByNodeId.get(activeNodeId) || [])];
        relatedConnections.forEach((connection) => {
            connectionIds.add(connection.id);
            nodeIds.add(connection.fromNodeId);
            nodeIds.add(connection.toNodeId);
        });

        return { nodeIds, connectionIds };
    }, [activeNodeId, connectionAdjacency]);

    const isOverviewCanvas = viewport.k < CANVAS_OVERVIEW_SCALE;

    const resourceContextNodeId = dialogNodeId || activeNodeId;
    const canvasResourceReferences = useMemo(() => buildCanvasResourceReferences(canvasGraph, resourceContextNodeId), [canvasGraph, resourceContextNodeId]);
    const resourceReferenceByNodeId = useMemo(() => new Map(canvasResourceReferences.map((reference) => [reference.nodeId, reference])), [canvasResourceReferences]);
    const agentSnapshot = useMemo<CanvasAgentSnapshot>(
        () => ({ projectId, title: projectTitle || "未命名画布", nodes, connections, selectedNodeIds: Array.from(selectedNodeIds), viewport: viewportRef.current }),
        [connections, projectTitle, nodes, projectId, selectedNodeIds],
    );
    const applyAgentOps = useCallback(
        (ops?: CanvasAgentOp[]) => {
            const safeOps = Array.isArray(ops) ? ops.filter((op) => op?.type) : [];
            const before = { projectId, title: projectTitle || "未命名画布", nodes: nodesRef.current, connections: connectionsRef.current, selectedNodeIds: Array.from(selectedNodeIdsRef.current), viewport: viewportRef.current };
            // 带 size / generationMode 的 update_node 走配置补丁通道，获得节点尺寸联动副作用
            const configPatchOps = safeOps.filter(
                (op): op is Extract<CanvasAgentOp, { type: "update_node" }> => op.type === "update_node" && Boolean(op.metadata && ("size" in op.metadata || "generationMode" in op.metadata)),
            );
            const configPatchSet = new Set<CanvasAgentOp>(configPatchOps);
            const sideEffectOps = safeOps.filter((op) => CANVAS_AGENT_SIDE_EFFECT_OP_TYPES.has(op.type));
            const pureOps = safeOps.filter((op) => !CANVAS_AGENT_SIDE_EFFECT_OP_TYPES.has(op.type) && !configPatchSet.has(op));
            const next = applyCanvasAgentOps(
                before,
                pureOps,
                {
                    createNode: (op, index) => {
                        const type = op.nodeType === CanvasNodeType.Config ? CanvasNodeType.ComfyUI : op.nodeType || CanvasNodeType.Text;
                        const node = createCanvasNode(type, op.position || { x: op.x ?? index * 36, y: op.y ?? index * 36 }, op.metadata);
                        return {
                            ...node,
                            ...(op.id ? { id: op.id } : null),
                            ...(op.title?.trim() ? { title: op.title } : null),
                            ...(typeof op.width === "number" ? { width: op.width } : null),
                            ...(typeof op.height === "number" ? { height: op.height } : null),
                        };
                    },
                    createConnection: (op) => ({
                        ...createCanvasConnection(op.fromNodeId, op.toNodeId),
                        ...(op.id ? { id: op.id } : null),
                    }),
                },
            );
            nodesRef.current = next.nodes;
            connectionsRef.current = next.connections;
            selectedNodeIdsRef.current = new Set(next.selectedNodeIds);
            viewportRef.current = next.viewport;
            setAgentUndoStack((prev) => [...prev.slice(-19), before]);
            setNodes(next.nodes);
            setConnections(next.connections);
            setSelectedNodeIds(new Set(next.selectedNodeIds));
            setSelectedConnectionId(null);
            setViewport(next.viewport);
            setContextMenu(null);
            const sideEffectResult = sideEffectOps.length || configPatchOps.length ? agentOpsDispatcherRef.current(sideEffectOps, configPatchOps) : Promise.resolve({});
            return Promise.resolve(sideEffectResult).then((extra) => ({ ...next, projectId, title: projectTitle || "未命名画布", ...(extra || {}) }));
        },
        [createCanvasConnection, createCanvasNode, projectTitle, projectId],
    );
    const undoAgentOps = useCallback(() => {
        const snapshot = agentUndoStack[agentUndoStack.length - 1];
        if (!snapshot) return null;
        nodesRef.current = snapshot.nodes;
        connectionsRef.current = snapshot.connections;
        selectedNodeIdsRef.current = new Set(snapshot.selectedNodeIds);
        viewportRef.current = snapshot.viewport;
        setNodes(snapshot.nodes);
        setConnections(snapshot.connections);
        setSelectedNodeIds(new Set(snapshot.selectedNodeIds));
        setSelectedConnectionId(null);
        setViewport(snapshot.viewport);
        setContextMenu(null);
        setAgentUndoStack((prev) => prev.slice(0, -1));
        return { ...snapshot, projectId, title: projectTitle || "未命名画布" };
    }, [agentUndoStack, projectTitle, projectId]);
    const createNode = useCallback(
        (
            type: CanvasNodeType,
            options: {
                position?: Position;
                title?: string;
                width?: number;
                height?: number;
                metadata?: CanvasNodeMetadata;
            } = {},
        ) => {
            const targetPosition = options.position || lastCanvasPositionRef.current || getCanvasCenter();
            const configMetadata =
                type === CanvasNodeType.Config
                    ? {
                          model: effectiveConfig.imageModel || effectiveConfig.model,
                          size: effectiveConfig.size,
                          count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
                      }
                    : undefined;
            const newNode = {
                ...createCanvasNode(type, targetPosition, { ...configMetadata, ...options.metadata }),
                ...(options.width ? { width: options.width } : null),
                ...(options.height ? { height: options.height } : null),
            };

            setNodes((prev) => [...prev, newNode]);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(newNode.id);
        },
        [createCanvasNode, effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, getCanvasCenter],
    );

    const createGroupFromSelection = useCallback(
        (variant: "normal" | "storyboard" = "normal") => {
            const selectedIds = Array.from(selectedNodeIdsRef.current);
            const selectedNodes = nodesRef.current.filter((node) => selectedIds.includes(node.id) && node.type !== CanvasNodeType.Group);
            if (selectedNodes.length < 2) {
                message.info("至少选择 2 个节点才能成组");
                return;
            }
            const existingGroupIds = new Set(nodesRef.current.filter((node) => node.type === CanvasNodeType.Group).flatMap((node) => node.metadata?.groupChildIds || []));
            const groupNodes = selectedNodes.filter((node) => !existingGroupIds.has(node.id));
            if (groupNodes.length < 2) {
                message.info("选中的节点已经在分组中");
                return;
            }

            const padding = 48;
            const left = Math.min(...groupNodes.map((node) => node.position.x)) - padding;
            const top = Math.min(...groupNodes.map((node) => node.position.y)) - padding;
            const right = Math.max(...groupNodes.map((node) => node.position.x + node.width)) + padding;
            const bottom = Math.max(...groupNodes.map((node) => node.position.y + node.height)) + padding;
            const group: CanvasNodeData = {
                ...createCanvasNode(CanvasNodeType.Group, { x: (left + right) / 2, y: (top + bottom) / 2 }, {
                    groupChildIds: groupNodes.map((node) => node.id),
                    groupVariant: variant,
                    status: NODE_STATUS_IDLE,
                }),
                position: { x: left, y: top },
                width: Math.max(220, right - left),
                height: Math.max(160, bottom - top),
            };

            nodesRef.current = [group, ...nodesRef.current];
            setNodes((prev) => [group, ...prev]);
            selectedNodeIdsRef.current = new Set([group.id]);
            setSelectedNodeIds(new Set([group.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(null);
            setContextMenu(null);
        },
        [createCanvasNode, message],
    );

    const ungroupNodes = useCallback((groupIds: string[]) => {
        const ids = new Set(groupIds);
        if (!ids.size) return;
        const nextNodes = nodesRef.current.filter((node) => !ids.has(node.id));
        nodesRef.current = nextNodes;
        setNodes(nextNodes);
        selectedNodeIdsRef.current = new Set();
        setSelectedNodeIds(new Set());
        setDialogNodeId(null);
        setContextMenu(null);
    }, []);

    const handleGroupAction = useCallback(
        (node: CanvasNodeData, action: "storyboard" | "ungroup") => {
            if (node.type !== CanvasNodeType.Group) return;
            if (action === "ungroup") {
                ungroupNodes([node.id]);
                return;
            }
            if (action === "storyboard") {
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, groupVariant: "storyboard" } } : item)));
                message.success("已转换为分镜组");
                return;
            }
        },
        [message, ungroupNodes],
    );

    const createScriptNode = useCallback(() => {
        const targetPosition = lastCanvasPositionRef.current || getCanvasCenter();
        const newNode = {
            ...createCanvasNode(CanvasNodeType.Text, targetPosition, {
                canvasTool: "script",
                content: DEFAULT_SCRIPT_BODY,
                scriptTitle: "未命名脚本",
                scriptLogline: "一句话描述故事目标、角色和转折",
                scriptBody: DEFAULT_SCRIPT_BODY,
                status: NODE_STATUS_SUCCESS,
                fontSize: 13,
                generationMode: "text",
            }),
            width: 220,
            height: 160,
        };
        nodesRef.current = [...nodesRef.current, newNode];
        setNodes((prev) => [...prev, newNode]);
        setSelectedNodeIds(new Set([newNode.id]));
        setSelectedConnectionId(null);
        setDialogNodeId(null);
        setEditingNodeId(null);
    }, [createCanvasNode, getCanvasCenter]);

    const createVideoCompositionNode = useCallback(() => {
        createNode(CanvasNodeType.ComfyUI, {
            width: 220,
            height: 132,
            metadata: { canvasTool: "videoComposition", generationMode: "video", status: NODE_STATUS_IDLE, count: 1 },
        });
    }, [createNode]);

    const createDirectorNode = useCallback(() => {
        createNode(CanvasNodeType.ComfyUI, {
            width: 220,
            height: 160,
            metadata: {
                canvasTool: "director",
                generationMode: "image",
                status: NODE_STATUS_IDLE,
            },
        });
    }, [createNode]);

    const createPanorama360Node = useCallback(() => {
        createNode(CanvasNodeType.Image, {
            width: 320,
            height: 180,
            metadata: {
                canvasTool: "panorama360",
                prompt: DEFAULT_PANORAMA_360_PROMPT,
                composerContent: DEFAULT_PANORAMA_360_PROMPT,
                generationMode: "image",
                status: NODE_STATUS_IDLE,
                count: 1,
                size: "2048x1024",
                freeResize: true,
            },
        });
    }, [createNode]);

    const deleteNodes = useCallback(
        (ids: Set<string>) => {
            if (!ids.size) return;
            const allIds = new Set(ids);
            nodesRef.current.forEach((node) => {
                if (ids.has(node.id)) node.metadata?.batchChildIds?.forEach((childId) => allIds.add(childId));
            });
            const nextNodes = nodesRef.current.filter((node) => !allIds.has(node.id));
            const remainingNodes = nextNodes.map((node) => {
                const groupChildIds = node.metadata?.groupChildIds?.filter((childId) => !allIds.has(childId));
                const childIds = node.metadata?.batchChildIds?.filter((childId) => !allIds.has(childId));
                const groupChanged = groupChildIds?.length !== node.metadata?.groupChildIds?.length;
                const batchChanged = node.metadata?.isBatchRoot && childIds?.length !== node.metadata.batchChildIds?.length;
                if (!groupChanged && !batchChanged) return node;
                const primaryImageId = childIds?.includes(node.metadata?.primaryImageId || "") ? node.metadata?.primaryImageId : childIds?.[0];
                const primaryNode = nextNodes.find((item) => item.id === primaryImageId);
                return {
                    ...node,
                    metadata: {
                        ...(batchChanged ? promoteImageMetadata(node.metadata, primaryNode?.metadata) : node.metadata),
                        ...(groupChanged ? { groupChildIds } : {}),
                        ...(batchChanged ? { batchChildIds: childIds, primaryImageId } : {}),
                    },
                };
            });
            nodesRef.current = remainingNodes;
            setNodes(remainingNodes);
            setConnections((prev) => prev.filter((conn) => !allIds.has(conn.fromNodeId) && !allIds.has(conn.toNodeId)));
            setSelectedNodeIds(new Set());
            setSelectedConnectionId(null);
            setHoveredNodeId((current) => (current && allIds.has(current) ? null : current));
            setToolbarNodeId((current) => (current && allIds.has(current) ? null : current));
            setDialogNodeId((current) => (current && allIds.has(current) ? null : current));
            setEditingNodeId((current) => (current && allIds.has(current) ? null : current));
            setInfoNodeId((current) => (current && allIds.has(current) ? null : current));
            setCropNodeId((current) => (current && allIds.has(current) ? null : current));
            setMaskEditNodeId((current) => (current && allIds.has(current) ? null : current));
            setAngleNodeId((current) => (current && allIds.has(current) ? null : current));
            setPreviewNodeId((current) => (current && allIds.has(current) ? null : current));
            setRunningNodeId((current) => (current && allIds.has(current) ? null : current));
            setContextMenu((current) => (current?.type === "node" && allIds.has(current.nodeId) ? null : current));
            cleanupCanvasFiles({ projectId, nodes: remainingNodes, chatSessions });
        },
        [chatSessions, cleanupCanvasFiles, projectId],
    );

    const deleteSelectedNodes = useCallback(() => {
        deleteNodes(new Set(selectedNodeIdsRef.current));
    }, [deleteNodes]);

    const deleteConnection = useCallback((connectionId: string) => {
        setConnections((prev) => prev.filter((conn) => conn.id !== connectionId));
        setSelectedConnectionId((current) => (current === connectionId ? null : current));
        setContextMenu((current) => (current?.type === "connection" && current.connectionId === connectionId ? null : current));
    }, []);

    const removeNodeReference = useCallback((targetNodeId: string, sourceNodeId: string) => {
        setConnections((previous) => previous.filter((connection) => !(connection.fromNodeId === sourceNodeId && connection.toNodeId === targetNodeId)));
    }, []);

    const selectConnection = useCallback((connectionId: string) => {
        resetImageTapGesture();
        selectedNodeIdsRef.current = new Set();
        selectedConnectionIdRef.current = connectionId;
        setSelectedConnectionId(connectionId);
        setSelectedNodeIds(new Set());
        setContextMenu(null);
        setDialogNodeId(null);
    }, [resetImageTapGesture]);

    const openConnectionContextMenu = useCallback((connectionId: string, clientX: number, clientY: number) => {
        resetImageTapGesture();
        selectedNodeIdsRef.current = new Set();
        selectedConnectionIdRef.current = connectionId;
        setSelectedConnectionId(connectionId);
        setSelectedNodeIds(new Set());
        setDialogNodeId(null);
        setContextMenu({ type: "connection", x: clientX, y: clientY, connectionId });
    }, [resetImageTapGesture]);

    const deselectCanvas = useCallback(() => {
        cancelPendingConnectionCreate();
        resetImageTapGesture();
        selectedNodeIdsRef.current = new Set();
        selectedConnectionIdRef.current = null;
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
        setEditingNodeId(null);
    }, [cancelPendingConnectionCreate, resetImageTapGesture]);

    const clearCanvas = useCallback(() => {
        setNodes([]);
        setConnections([]);
        nodeSequenceCountersRef.current = {};
        referenceOrderCounterRef.current = 0;
        setNodeSequenceCounters({});
        setReferenceOrderCounter(0);
        setInfoNodeId(null);
        setCropNodeId(null);
        setMaskEditNodeId(null);
        setAngleNodeId(null);
        setOutpaintNodeId(null);
        setLightingNodeId(null);
        setPreviewNodeId(null);
        setRunningNodeId(null);
        deselectCanvas();
        setClearConfirmOpen(false);
        cleanupCanvasFiles({ projectId, nodes: [], chatSessions: [] });
    }, [cleanupCanvasFiles, deselectCanvas, projectId]);

    const duplicateNode = useCallback((nodeId: string) => {
        const source = nodesRef.current.find((node) => node.id === nodeId);
        if (!source) return;

        const next: CanvasNodeData = {
            ...createCanvasNode(
                source.type,
                {
                    x: source.position.x + source.width / 2 + 36,
                    y: source.position.y + source.height / 2 + 36,
                },
                source.metadata,
            ),
            position: { x: source.position.x + 36, y: source.position.y + 36 },
            width: source.width,
            height: source.height,
        };

        setNodes((prev) => [...prev, next]);
        setSelectedNodeIds(new Set([next.id]));
        setSelectedConnectionId(null);
        setDialogNodeId(next.id);
    }, [createCanvasNode]);

    const copySelectedNodes = useCallback(() => {
        const selectedIds = selectedNodeIdsRef.current;
        if (!selectedIds.size) return;

        const copiedNodes = nodesRef.current
            .filter((node) => selectedIds.has(node.id))
            .map((node) => ({
                ...node,
                position: { ...node.position },
                metadata: node.metadata ? { ...node.metadata } : undefined,
            }));

        if (!copiedNodes.length) return;

        crossCanvasClipboard.current = {
            nodes: copiedNodes,
            connections: connectionsRef.current.filter((connection) => selectedIds.has(connection.fromNodeId) && selectedIds.has(connection.toNodeId)).map((connection) => ({ ...connection })),
        };
    }, []);

    const saveSelectionAsTemplate = useCallback(
        async (name: string) => {
            if (!token) return null;
            const selectedIds = selectedNodeIdsRef.current;
            if (!selectedIds.size) return null;
            const templateNodes = nodesRef.current.filter((node) => selectedIds.has(node.id));
            if (!templateNodes.length) return null;

            const origin = canvasSelectionCenter(templateNodes);
            const normalizedNodes = templateNodes.map((node) => ({
                ...node,
                position: { x: node.position.x - origin.x, y: node.position.y - origin.y },
                metadata: node.metadata ? { ...node.metadata } : undefined,
            }));
            const templateConnections = connectionsRef.current
                .filter((connection) => selectedIds.has(connection.fromNodeId) && selectedIds.has(connection.toNodeId))
                .map((connection) => ({ ...connection }));

            try {
                const saved = await saveCanvasTemplate(token, {
                    name: name.trim() || `模板 ${workflowTemplates.length + 1}`,
                    nodes: normalizedNodes,
                    connections: templateConnections,
                });
                setWorkflowTemplates((prev) => [...prev, saved]);
                message.success(`已保存模板「${saved.name}」（${saved.nodes.length} 个节点）`);
                return saved;
            } catch {
                message.error("保存模板失败，请稍后重试");
                return null;
            }
        },
        [message, token, workflowTemplates],
    );

    const insertWorkflowTemplate = useCallback(
        (template: CanvasWorkflowTemplate) => {
            if (!template.nodes.length) return;
            const center = getCanvasCenter();
            const templateCenter = canvasSelectionCenter(template.nodes);
            const baseDx = center.x - templateCenter.x;
            const baseDy = center.y - templateCenter.y;
            // 插入位置避免与现有节点重叠：先放视口中心，碰撞则向右逐档偏移，再向下换行。
            const boundsWidth = Math.max(...template.nodes.map((node) => node.position.x + node.width)) - Math.min(...template.nodes.map((node) => node.position.x));
            const boundsHeight = Math.max(...template.nodes.map((node) => node.position.y + node.height)) - Math.min(...template.nodes.map((node) => node.position.y));
            const overlaps = (offsetX: number, offsetY: number) =>
                template.nodes.some((node) => {
                    const x = node.position.x + offsetX;
                    const y = node.position.y + offsetY;
                    return nodesRef.current.some(
                        (existing) =>
                            x < existing.position.x + existing.width && x + node.width > existing.position.x && y < existing.position.y + existing.height && y + node.height > existing.position.y,
                    );
                });
            let dx = baseDx;
            let dy = baseDy;
            for (let attempt = 0; overlaps(dx, dy) && attempt < 12; attempt += 1) {
                if (attempt === 6) {
                    dx = baseDx;
                    dy = baseDy + boundsHeight + 80;
                } else {
                    dx += boundsWidth + 80;
                }
            }
            const { nodes: nextNodes, connections: nextConnections } = cloneCanvasSelection(
                template.nodes,
                template.connections,
                { x: dx, y: dy },
                (source, position, metadata) => ({
                    ...createCanvasNode(source.type, { x: position.x + source.width / 2, y: position.y + source.height / 2 }, metadata),
                    position,
                    width: source.width,
                    height: source.height,
                }),
                createCanvasConnection,
            );
            setNodes((prev) => [...prev, ...nextNodes]);
            setConnections((prev) => [...prev, ...nextConnections]);
            setSelectedNodeIds(new Set(nextNodes.map((node) => node.id)));
            setSelectedConnectionId(null);
            setDialogNodeId(null);
            message.success(`已插入模板「${template.name}」`);
        },
        [createCanvasConnection, createCanvasNode, getCanvasCenter, message],
    );

    const deleteWorkflowTemplate = useCallback(
        async (templateId: string) => {
            if (!token) return;
            try {
                await deleteCanvasTemplate(token, templateId);
                setWorkflowTemplates((prev) => prev.filter((template) => template.id !== templateId));
                message.success("已删除模板");
            } catch {
                message.error("删除模板失败，请稍后重试");
            }
        },
        [message, token],
    );

    const pasteCopiedNodes = useCallback(() => {
        const clipboard = crossCanvasClipboard.current;
        if (!clipboard?.nodes.length) return false;

        const center = getCanvasCenter();
        const boundsCenter = canvasSelectionCenter(clipboard.nodes);
        const dx = center.x - boundsCenter.x;
        const dy = center.y - boundsCenter.y;
        const { nodes: nextNodes, connections: nextConnections } = cloneCanvasSelection(
            clipboard.nodes,
            clipboard.connections,
            { x: dx, y: dy },
            (source, position, metadata) => ({
                ...createCanvasNode(source.type, { x: position.x + source.width / 2, y: position.y + source.height / 2 }, metadata),
                position,
                width: source.width,
                height: source.height,
            }),
            createCanvasConnection,
        );

        setNodes((prev) => [...prev, ...nextNodes]);
        setConnections((prev) => [...prev, ...nextConnections]);
        setSelectedNodeIds(new Set(nextNodes.map((node) => node.id)));
        setSelectedConnectionId(null);
        setContextMenu(null);
        setDialogNodeId(nextNodes[0]?.id || null);
        return true;
    }, [createCanvasConnection, createCanvasNode, getCanvasCenter]);

    const resetViewport = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        const width = rect?.width || size.width;
        const height = rect?.height || size.height;
        const fitNodes = nodes.filter((node) => !hiddenBatchChildIdsRef.current.has(node.id));
        if (!fitNodes.length || !width || !height) {
            const next = { x: width / 2, y: height / 2, k: 1 };
            viewportRef.current = next;
            setViewport(next);
            setContextMenu(null);
            return;
        }
        const bounds = fitNodes.reduce(
            (result, node) => ({
                left: Math.min(result.left, node.position.x),
                top: Math.min(result.top, node.position.y),
                right: Math.max(result.right, node.position.x + node.width),
                bottom: Math.max(result.bottom, node.position.y + node.height),
            }),
            { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
        );
        const padding = 96;
        const contentWidth = Math.max(1, bounds.right - bounds.left);
        const contentHeight = Math.max(1, bounds.bottom - bounds.top);
        const scale = clampCanvasZoom(Math.min(1, (width - padding * 2) / contentWidth, (height - padding * 2) / contentHeight));
        const centerX = (bounds.left + bounds.right) / 2;
        const centerY = (bounds.top + bounds.bottom) / 2;
        const next = { x: width / 2 - centerX * scale, y: height / 2 - centerY * scale, k: scale };
        viewportRef.current = next;
        setViewport(next);
        setContextMenu(null);
    }, [nodes, size.height, size.width]);

    const setZoomScale = useCallback(
        (scale: number) => {
            const nextScale = clampCanvasZoom(scale);
            const rect = containerRef.current?.getBoundingClientRect();
            const width = rect?.width && rect.width > 0 ? rect.width : size.width;
            const height = rect?.height && rect.height > 0 ? rect.height : size.height;
            setViewport((prev) => {
                const next = {
                    x: width / 2 - ((width / 2 - prev.x) / prev.k) * nextScale,
                    y: height / 2 - ((height / 2 - prev.y) / prev.k) * nextScale,
                    k: nextScale,
                };
                viewportRef.current = next;
                return next;
            });
            setContextMenu(null);
        },
        [size.height, size.width],
    );

    const applyHistory = useCallback((entry: CanvasHistoryEntry) => {
        if (historyCommitTimerRef.current) {
            clearTimeout(historyCommitTimerRef.current);
            historyCommitTimerRef.current = null;
        }
        applyingHistoryRef.current = true;
        setNodes(entry.nodes);
        setConnections(entry.connections);
        setChatSessions(entry.chatSessions);
        setActiveChatId(entry.activeChatId);
        setBackgroundMode(entry.backgroundMode);
        setSnapToGrid(entry.snapToGrid);
        setAlignmentGuidesEnabled(entry.alignmentGuidesEnabled !== false);
        setShowImageInfo(entry.showImageInfo);
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        setTimeout(() => {
            lastHistoryRef.current = entry;
            applyingHistoryRef.current = false;
            setHistoryState({ canUndo: historyRef.current.past.length > 0, canRedo: historyRef.current.future.length > 0 });
        });
    }, []);

    const undoCanvas = useCallback(() => {
        const previous = historyRef.current.past.pop();
        const current = lastHistoryRef.current;
        if (!previous || !current) return;
        historyRef.current.future.push(current);
        applyHistory(previous);
    }, [applyHistory]);

    const redoCanvas = useCallback(() => {
        const next = historyRef.current.future.pop();
        const current = lastHistoryRef.current;
        if (!next || !current) return;
        historyRef.current.past.push(current);
        applyHistory(next);
    }, [applyHistory]);

    const createAndOpenProject = useCallback(() => {
        // VOZEB：项目 id 由服务端分配，先建远端项目再跳转
        void (async () => {
            try {
                const project = await createCanvasProjectOnServer(`无限画布 ${useCanvasStore.getState().projects.length + 1}`);
                const state = useCanvasStore.getState();
                state.replaceProjects([...state.projects, project], state.projectTombstones);
                navigate(`/canvas/${project.id}`);
            } catch {
                message.error("画布创建失败");
            }
        })();
    }, [message, navigate]);

    const deleteCurrentProject = useCallback(() => {
        deleteProjects([projectId]);
        cleanupAssetImages();
        navigate("/canvas");
    }, [cleanupAssetImages, deleteProjects, navigate, projectId]);

    const handleCanvasMouseDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>, canvasPosition: Position) => {
            lastCanvasPositionRef.current = canvasPosition;
            setContextMenu(null);
            if (pendingConnectionCreateRef.current) cancelPendingConnectionCreate();
        },
        [cancelPendingConnectionCreate],
    );

    const createImageFileNode = useCallback(async (file: File, position: Position) => {
        const image = await uploadImage(file);
        const size = fitNodeSize(image.width, image.height);
        const newNode: CanvasNodeData = {
            ...createCanvasNode(CanvasNodeType.Image, position, { ...imageMetadata(image), freeResize: true }),
            position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
            width: size.width,
            height: size.height,
        };

        setNodes((prev) => [...prev, newNode]);
        setSelectedNodeIds(new Set([newNode.id]));
        setSelectedConnectionId(null);
        setDialogNodeId(newNode.id);
    }, [createCanvasNode]);

    const createVideoFileNode = useCallback(async (file: File, position: Position) => {
        const video = await uploadMediaFile(file, "video");
        const size = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
        const newNode: CanvasNodeData = {
            ...createCanvasNode(CanvasNodeType.Video, position, videoMetadata(video)),
            position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
            width: size.width,
            height: size.height,
        };
        setNodes((prev) => [
            ...prev,
            newNode,
        ]);
        setSelectedNodeIds(new Set([newNode.id]));
        setSelectedConnectionId(null);
        setDialogNodeId(newNode.id);
    }, [createCanvasNode]);

    const createAudioFileNode = useCallback(async (file: File, position: Position) => {
        const audio = await uploadMediaFile(file, "audio");
        const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
        const newNode: CanvasNodeData = {
            ...createCanvasNode(CanvasNodeType.Audio, position, audioMetadata(audio)),
            position: { x: position.x - spec.width / 2, y: position.y - spec.height / 2 },
            width: spec.width,
            height: spec.height,
        };
        setNodes((prev) => [
            ...prev,
            newNode,
        ]);
        setSelectedNodeIds(new Set([newNode.id]));
        setSelectedConnectionId(null);
        setDialogNodeId(newNode.id);
    }, [createCanvasNode]);

    const createTextFileNode = useCallback(
        async (file: File, position: Position) => {
            const content = await file.text();
            const trimmed = content.trim();
            if (!trimmed) {
                message.warning("文本文件为空");
                return;
            }
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
            const isScript = isScriptTextFile(file);
            const node: CanvasNodeData = {
                ...createCanvasNode(CanvasNodeType.Text, position, {
                    content: trimmed,
                    status: NODE_STATUS_SUCCESS,
                    fontSize: isScript ? 13 : 14,
                    generationMode: "text",
                    ...(isScript
                        ? {
                              canvasTool: "script" as const,
                              scriptTitle: file.name.replace(/\.[^.]+$/, ""),
                              scriptLogline: "",
                              scriptBody: trimmed,
                          }
                        : null),
                }),
                position: { x: position.x - spec.width / 2, y: position.y - spec.height / 2 },
                width: isScript ? 220 : spec.width,
                height: isScript ? 160 : spec.height,
            };
            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(node.id);
        },
        [createCanvasNode, message],
    );

    const createTextNodeFromClipboard = useCallback(
        (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return false;

            const node = createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), { content: trimmed, status: NODE_STATUS_SUCCESS });

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setContextMenu(null);
            setDialogNodeId(node.id);
            return true;
        },
        [getCanvasCenter],
    );

    const pasteSystemClipboard = useCallback(async () => {
        if (!navigator.clipboard) return;

        const items = await navigator.clipboard.read();
        const imageItem = items.find((item) => item.types.some((type) => type.startsWith("image/")));
        if (imageItem) {
            const imageType = imageItem.types.find((type) => type.startsWith("image/"));
            if (!imageType) return;
            const blob = await imageItem.getType(imageType);
            const file = new File([blob], "clipboard-image.png", { type: imageType });
            void createImageFileNode(file, getCanvasCenter());
            message.success("已从剪切板添加图片");
            return;
        }

        const text = await navigator.clipboard.readText();
        if (createTextNodeFromClipboard(text)) message.success("已从剪切板添加文本");
    }, [createImageFileNode, createTextNodeFromClipboard, getCanvasCenter, message]);

    // 定义在 ⌘J 快捷键 useEffect 之前——依赖数组引用这两个函数，const 声明在后会触发 TDZ
    const openAgent = (mode: CanvasAgentMode = agentMode) => {
        if (agentCloseTimerRef.current) {
            clearTimeout(agentCloseTimerRef.current);
            agentCloseTimerRef.current = null;
        }
        setAgentMode(mode);
        setAssistantMounted(true);
        setAssistantClosing(false);
        setAssistantCollapsed(false);
    };
    const closeAgent = () => {
        if (!assistantMounted || assistantClosing) return;
        setAssistantCollapsed(true);
        setAssistantClosing(true);
        agentCloseTimerRef.current = setTimeout(() => {
            agentCloseTimerRef.current = null;
            setAssistantMounted(false);
            setAssistantClosing(false);
        }, CANVAS_AGENT_PANEL_MOTION_MS);
    };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            const isEditingText =
                event.target instanceof HTMLInputElement ||
                event.target instanceof HTMLTextAreaElement ||
                event.target instanceof HTMLSelectElement ||
                Boolean(target?.closest("[contenteditable='true'],[role='textbox']"));
            if (isEditingText) return;

            const key = event.key.toLowerCase();
            const isModifierShortcut = event.metaKey || event.ctrlKey;

            if (['Control', 'Meta', 'Shift'].includes(event.key)) {
                setDialogNodeId(null);
                setToolbarNodeId(null);
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "z") {
                event.preventDefault();
                if (event.shiftKey) redoCanvas();
                else undoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "y") {
                event.preventDefault();
                redoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "a") {
                event.preventDefault();
                setSelectedNodeIds(new Set(nodesRef.current.map((node) => node.id)));
                setSelectedConnectionId(null);
                setContextMenu(null);
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "c") {
                event.preventDefault();
                copySelectedNodes();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "v") {
                event.preventDefault();
                if (!pasteCopiedNodes()) void pasteSystemClipboard();
                return;
            }

            // Ctrl/Cmd+D 复制选中节点和连线（副本落到视口中心并选中）
            if (isModifierShortcut && !event.altKey && key === "d") {
                event.preventDefault();
                if (selectedNodeIdsRef.current.size) {
                    copySelectedNodes();
                    pasteCopiedNodes();
                }
                return;
            }

            // Ctrl/Cmd+Enter 运行选中的可生成节点（复用节点重试链路）
            if (isModifierShortcut && !event.altKey && event.key === "Enter") {
                event.preventDefault();
                const selected = selectedNodeIdsRef.current;
                const targets = nodesRef.current.filter(
                    (node) => selected.has(node.id) && isGroupExecutableNode(node, connectionsRef.current.some((connection) => connection.toNodeId === node.id)),
                );
                if (!targets.length) {
                    message.info("选中的节点没有可执行的生成任务");
                    return;
                }
                targets.forEach((node) => retryNodeRef.current?.(node));
                return;
            }

            // Tab 打开统一创建菜单（落在最后画布交互点，无视口交互过则在视口中心）
            if (event.key === "Tab") {
                event.preventDefault();
                const shellRect = canvasShellRef.current?.getBoundingClientRect();
                const vp = viewportRef.current;
                const centerClient = {
                    x: (shellRect?.left ?? 0) + (shellRect?.width ?? window.innerWidth) / 2,
                    y: (shellRect?.top ?? 0) + (shellRect?.height ?? window.innerHeight) / 2,
                };
                const world = lastCanvasPositionRef.current ?? screenToCanvas(centerClient.x, centerClient.y);
                const client = lastCanvasPositionRef.current && shellRect
                    ? { x: shellRect.left + world.x * vp.k + vp.x, y: shellRect.top + world.y * vp.k + vp.y }
                    : centerClient;
                setContextMenu(null);
                setCreateMenu({ x: client.x, y: client.y, canvasPosition: world });
                return;
            }

            if (isModifierShortcut && !event.altKey && (event.key === "+" || event.key === "=")) {
                event.preventDefault();
                setZoomScale(stepCanvasZoom(viewportRef.current.k, "in"));
                return;
            }

            if (isModifierShortcut && !event.altKey && event.key === "-") {
                event.preventDefault();
                setZoomScale(stepCanvasZoom(viewportRef.current.k, "out"));
                return;
            }

            if (isModifierShortcut && !event.altKey && event.key === "0") {
                event.preventDefault();
                resetViewport();
                return;
            }

            // 拦截浏览器原生快捷键，避免触发保存网页/打印对话框
            if (isModifierShortcut && !event.altKey && (key === "s" || key === "p")) {
                event.preventDefault();
                return;
            }

            // ⌘J / Ctrl+J 唤起或收起创作 Agent（与 TapNow 一致）
            if (isModifierShortcut && !event.altKey && key === "j") {
                event.preventDefault();
                if (assistantMounted && !assistantCollapsed) closeAgent();
                else openAgent();
                return;
            }

            // ⌘F / Ctrl+F 唤起搜索面板（TapNow：搜索后自动定位+高亮）
            if (isModifierShortcut && !event.altKey && key === "f") {
                event.preventDefault();
                setSearchOpen(true);
                return;
            }

            if ((isModifierShortcut || event.altKey) && key === "g") {
                event.preventDefault();
                if (event.shiftKey) {
                    const groupIds = Array.from(selectedNodeIdsRef.current).filter((id) => nodeByIdRef.current.get(id)?.type === CanvasNodeType.Group);
                    ungroupNodes(groupIds);
                } else {
                    createGroupFromSelection(isModifierShortcut && event.altKey ? "storyboard" : "normal");
                }
                return;
            }

            if (event.key === "Delete" || event.key === "Backspace") {
                const selectedIds = selectedNodeIdsRef.current;
                const selectedConnection = selectedConnectionIdRef.current;
                if (!selectedIds.size && !selectedConnection) return;
                event.preventDefault();
                event.stopPropagation();
                if (selectedIds.size) {
                    deleteSelectedNodes();
                } else if (selectedConnection) {
                    deleteConnection(selectedConnection);
                }
                return;
            }

            if (event.key === "Escape") {
                resetImageTapGesture();
                setSelectedNodeIds(new Set());
                setSelectedConnectionId(null);
                setContextMenu(null);
                connectingParamsRef.current = null;
                setConnecting(null);
                setHoveredNodeId(null);
                setToolbarNodeId(null);
                setDialogNodeId(null);
                setEditingNodeId(null);
                setInfoNodeId(null);
                setCropNodeId(null);
                setMaskEditNodeId(null);
                setPendingConnectionCreate(null);
                setSearchOpen(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown, { capture: true });
        return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
    }, [assistantCollapsed, assistantMounted, closeAgent, copySelectedNodes, createGroupFromSelection, deleteConnection, deleteSelectedNodes, message, openAgent, pasteCopiedNodes, pasteSystemClipboard, redoCanvas, resetImageTapGesture, resetViewport, screenToCanvas, setConnecting, setZoomScale, undoCanvas, ungroupNodes]);

    const handleConnectStart = useCallback(
        (nodeId: string, handleType: "source" | "target") => {
            const nextConnection = { nodeId, handleType };
            connectingParamsRef.current = nextConnection;
            setConnecting(nextConnection);
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
            setSelectedConnectionId(null);
        },
        [setConnecting],
    );

    const handleLeaferNodePointerDown = useCallback((nodeId: string, modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement && activeElement.closest("[data-canvas-composer]")) {
            activeElement.blur();
        }
        setContextMenu(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        selectedConnectionIdRef.current = null;
        setSelectedConnectionId(null);

        const currentSelected = selectedNodeIdsRef.current;
        const nextSelected = new Set(currentSelected);
        const isToggle = modifiers.shiftKey || modifiers.metaKey || modifiers.ctrlKey;
        if (isToggle) {
            if (nextSelected.has(nodeId)) {
                nextSelected.delete(nodeId);
            } else {
                nextSelected.add(nodeId);
            }
        } else if (!nextSelected.has(nodeId)) {
            nextSelected.clear();
            nextSelected.add(nodeId);
        }

        if (!setsEqual(currentSelected, nextSelected)) {
            selectedNodeIdsRef.current = nextSelected;
            setSelectedNodeIds(nextSelected);
        }
        const node = nodeByIdRef.current.get(nodeId);
        const isMediaPreviewNode =
            node?.type === CanvasNodeType.Image &&
            Boolean(node.metadata?.content || node.metadata?.storageKey);
        if (!isMediaPreviewNode || isToggle || imageTapGestureRef.current.nodeId !== nodeId) resetImageTapGesture();
        if (!isToggle && nextSelected.size === 1 && node?.type !== CanvasNodeType.Group && node?.metadata?.canvasTool !== "director") {
            setDialogNodeId(nodeId);
        } else {
            setDialogNodeId(null);
        }
        return !isToggle;
    }, [resetImageTapGesture]);

    const handleNodeResize = useCallback((nodeId: string, width: number, height: number, position?: Position) => {
        setNodes((prev) => {
            let changed = false;
            const next = prev.map((node) => {
                if (node.id !== nodeId) return node;
                const nextPosition = position || node.position;
                if (node.width === width && node.height === height && node.position.x === nextPosition.x && node.position.y === nextPosition.y) return node;
                changed = true;
                return { ...node, width, height, position: nextPosition };
            });
            return changed ? reconcileGroupMembership(next) : prev;
        });
    }, []);

    // 节点写入路径统一为「函数式 updater + 双同步 nodesRef」：
    // - updater 基于 store 最新状态原子合并，与拖拽提交、视频任务保存等并发写互不覆盖；
    // - updater 内同步 nodesRef，使渲染后的 ref 与 store 恒一致；
    // - 函数外再用当前 ref 立即同步一次（React 批处理尚未 flush 时），
    //   保证 pagehide/blur 等同步事件流能立即读到最终坐标。
    const handleLeaferNodesTransform = useCallback((updates: Array<{ id: string; position: Position; width: number; height: number }>) => {
        const updatesById = new Map(updates.map((update) => [update.id, update]));
        const applyUpdates = (nodes: CanvasNodeData[]) => {
            let changed = false;
            const next = nodes.map((node) => {
                const update = updatesById.get(node.id);
                if (!update) return node;
                if (
                    node.position.x === update.position.x
                    && node.position.y === update.position.y
                    && node.width === update.width
                    && node.height === update.height
                ) return node;
                changed = true;
                return { ...node, position: update.position, width: update.width, height: update.height };
            });
            return changed ? next : nodes;
        };
        setNodes((prev) => {
            const next = applyUpdates(prev);
            if (next !== prev) nodesRef.current = next;
            return next;
        });
        nodesRef.current = applyUpdates(nodesRef.current);
    }, []);

    const handleLeaferNodesTransformEnd = useCallback(() => {
        setNodes((prev) => {
            const next = reconcileGroupMembership(prev);
            nodesRef.current = next;
            return next;
        });
        nodesRef.current = reconcileGroupMembership(nodesRef.current);
        multiNodeDragStartRef.current = null;
        setAlignmentGuides(null);
        historyPausedRef.current = false;
        nodeDraggingRef.current = false;
        setIsNodeDragging(false);
    }, []);

    const toggleNodeFreeResize = useCallback((nodeId: string) => {
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                const freeResize = !node.metadata?.freeResize;
                if (freeResize || node.type !== CanvasNodeType.Image) return { ...node, metadata: { ...node.metadata, freeResize } };
                const ratio = (node.metadata?.naturalWidth || node.width) / (node.metadata?.naturalHeight || node.height || 1);
                const height = node.width / ratio;
                return { ...node, height, position: { x: node.position.x, y: node.position.y + node.height / 2 - height / 2 }, metadata: { ...node.metadata, freeResize } };
            }),
        );
    }, []);

    const markNodeAsPanorama360 = useCallback(
        (nodeId: string) => {
            const changed = nodesRef.current.some(
                (node) => node.id === nodeId && node.type === CanvasNodeType.Image && node.metadata?.canvasTool !== "panorama360",
            );
            setNodes((prev) =>
                prev.map((node) => {
                    if (node.id !== nodeId || node.type !== CanvasNodeType.Image) return node;
                    if (node.metadata?.canvasTool === "panorama360") return node;
                    return {
                        ...node,
                        metadata: {
                            ...node.metadata,
                            canvasTool: "panorama360",
                            generationMode: "image",
                            size: node.metadata?.size || "2048x1024",
                            freeResize: true,
                        },
                    };
                }),
            );
            message.success(changed ? "已标记为360场景，三击图片可进入全景预览" : "当前图片已经是360场景");
        },
        [message],
    );

    const handleNodeContentChange = useCallback((nodeId: string, content: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, content } } : node)));
    }, []);

    const handleNodeTextFormatChange = useCallback((nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, ...patch } } : node)));
    }, []);

    const handleNodeTitleChange = useCallback((nodeId: string, title: string) => {
        const nextTitle = title.trim();
        if (!nextTitle) return;
        setNodes((prev) => prev.map((node) => (node.id === nodeId && node.title !== nextTitle ? { ...node, title: nextTitle } : node)));
    }, []);

    const toggleBatchExpanded = useCallback((nodeId: string) => {
        const isExpanded = Boolean(nodesRef.current.find((node) => node.id === nodeId)?.metadata?.imageBatchExpanded);
        if (isExpanded) {
            setCollapsingBatchIds((prev) => new Set(prev).add(nodeId));
            window.setTimeout(() => {
                setCollapsingBatchIds((prev) => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            }, 320);
        } else {
            setOpeningBatchIds((prev) => new Set(prev).add(nodeId));
            window.setTimeout(() => {
                setOpeningBatchIds((prev) => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            }, 260);
        }
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                return { ...node, metadata: { ...node.metadata, imageBatchExpanded: !node.metadata?.imageBatchExpanded } };
            }),
        );
    }, []);

    const setBatchPrimary = useCallback((child: CanvasNodeData) => {
        const rootId = child.metadata?.batchRootId;
        if (!rootId || !child.metadata?.content) return;
        setNodes((prev) =>
            prev.map((node) =>
                node.id === rootId
                    ? {
                          ...node,
                          width: child.width,
                          height: child.height,
                          metadata: {
                              ...promoteImageMetadata(node.metadata, child.metadata),
                              primaryImageId: child.id,
                          },
                      }
                    : node,
            ),
        );
    }, []);

    const openTextEditor = useCallback((node: CanvasNodeData) => {
        if (node.type !== CanvasNodeType.Text) return;
        const next = new Set([node.id]);
        selectedNodeIdsRef.current = next;
        setSelectedNodeIds(next);
        selectedConnectionIdRef.current = null;
        setSelectedConnectionId(null);
        setDialogNodeId(null);
        setEditingNodeId(node.id);
        setEditRequestNonce((value) => value + 1);
    }, []);

    const handleNodePromptChange = useCallback((nodeId: string, prompt: string) => {
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                // ComfyUI 节点：提示词只存 composerContent（Composer 编辑区），不写入节点级 prompt，
                // 避免缩小画布时节点显示提示词、生成时强制引用节点 prompt 而忽略用户修改。
                if (node.type === CanvasNodeType.ComfyUI) {
                    if (node.metadata?.composerContent === prompt) return node;
                    return { ...node, metadata: { ...node.metadata, composerContent: prompt } };
                }
                if (node.metadata?.prompt === prompt) return node;
                return { ...node, metadata: { ...node.metadata, prompt } };
            }),
        );
    }, []);

    const handleConfigNodeChange = useCallback((nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => {
        setNodes((prev) => {
            const next = prev.map((node) => (node.id === nodeId ? applyNodeConfigPatch(node, patch) : node));
            nodesRef.current = next;
            return next;
        });
    }, []);

    const handleConfigNodeHeightChange = useCallback((nodeId: string, height: number) => {
        setNodes((prev) => {
            let changed = false;
            const next = prev.map((node) => {
                if (node.id !== nodeId || node.height === height) return node;
                changed = true;
                return { ...node, height };
            });
            return changed ? next : prev;
        });
    }, []);

    const handleNodeHoverStart = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current) return;
            keepNodeToolbar(nodeId);
        },
        [keepNodeToolbar],
    );

    const handleNodeHoverEnd = useCallback(() => {
        hideNodeToolbar();
    }, [hideNodeToolbar]);

    const handleNodeContextMenu = useCallback((event: ReactMouseEvent, id: string) => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId: id });
    }, []);

    const downloadNodeImage = useCallback(async (node: CanvasNodeData) => {
        if ((node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) || !node.metadata?.content) return;
        const url = await resolveNodeContent(node);
        saveAs(url, `canvas-${node.type}-${node.id}.${node.type === CanvasNodeType.Video ? "mp4" : node.type === CanvasNodeType.Audio ? audioExtension(node.metadata.mimeType) : imageExtension(url)}`);
    }, []);

    const saveNodeAsset = useCallback(
        async (node: CanvasNodeData) => {
            if (node.type === CanvasNodeType.Text) {
                const content = node.metadata?.content?.trim();
                if (!content) return message.error("没有可保存的文本");
                addAsset({ kind: "text", title: node.metadata?.prompt?.slice(0, 24) || "画布文本", coverUrl: "", tags: [], source: "Canvas", data: { content }, metadata: { source: "canvas", nodeId: node.id } });
                message.success("已加入我的素材");
                return;
            }
            if (node.type === CanvasNodeType.Video) {
                if (!node.metadata?.content) return message.error("没有可保存的视频");
                addAsset({
                    kind: "video",
                    title: node.metadata?.prompt?.slice(0, 24) || "画布视频",
                    coverUrl: "",
                    tags: [],
                    source: "Canvas",
                    data: { url: node.metadata.content, storageKey: node.metadata.storageKey, width: node.width, height: node.height, bytes: node.metadata.bytes || 0, mimeType: node.metadata.mimeType || "video/mp4" },
                    metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt },
                });
                message.success("已加入我的素材");
                return;
            }
            if (node.type === CanvasNodeType.Audio) {
                if (!node.metadata?.content) return message.error("没有可保存的音频");
                addAsset({
                    kind: "audio",
                    title: node.metadata?.prompt?.slice(0, 24) || "画布音频",
                    coverUrl: "",
                    tags: [],
                    source: "Canvas",
                    data: { url: node.metadata.content, storageKey: node.metadata.storageKey, bytes: node.metadata.bytes || 0, mimeType: node.metadata.mimeType || "audio/mpeg", durationMs: node.metadata.durationMs },
                    metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt },
                });
                message.success("已加入我的素材");
                return;
            }
            if (!node.metadata?.content) return message.error("没有可保存的图片");
            const dataUrl = node.metadata.storageKey ? "" : node.metadata.content;
            addAsset({
                kind: "image",
                title: node.metadata?.prompt?.slice(0, 24) || "画布图片",
                coverUrl: node.metadata.content,
                tags: [],
                source: "Canvas",
                data: {
                    dataUrl,
                    storageKey: node.metadata.storageKey,
                    width: node.metadata.naturalWidth || node.width,
                    height: node.metadata.naturalHeight || node.height,
                    bytes: node.metadata.bytes || getDataUrlByteSize(dataUrl),
                    mimeType: node.metadata.mimeType || "image/png",
                },
                metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt },
            });
            message.success("已加入我的素材");
        },
        [addAsset, message],
    );

    const createImageReversePromptNodes = useCallback(
        (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Image || !node.metadata?.content) {
                message.warning("图片节点为空，无法反推提示词");
                return;
            }

            const gap = 96;
            const textSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
            const centerY = node.position.y + node.height / 2;
            const textNode = {
                ...createCanvasNode(CanvasNodeType.Text, { x: node.position.x + node.width + gap + textSpec.width / 2, y: centerY }, { content: IMAGE_PROMPT_REVERSE_PRESET, prompt: IMAGE_PROMPT_REVERSE_PRESET, status: NODE_STATUS_SUCCESS, fontSize: 14 }),
            };
            const resultNode = {
                ...createCanvasNode(
                    CanvasNodeType.Text,
                    { x: textNode.position.x + textNode.width + gap + textSpec.width / 2, y: centerY },
                    {
                        generationMode: "text",
                        model: effectiveConfig.textModel || effectiveConfig.model || defaultConfig.textModel,
                        count: 1,
                        composerContent: `参考图片：@[node:${node.id}]\n任务说明：@[node:${textNode.id}]`,
                        status: NODE_STATUS_IDLE,
                    },
                ),
            };

            setNodes((prev) => [...prev, textNode, resultNode]);
            setConnections((prev) => [
                ...prev,
                createCanvasConnection(node.id, resultNode.id),
                createCanvasConnection(textNode.id, resultNode.id),
            ]);
            setSelectedNodeIds(new Set([resultNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(resultNode.id);
            setContextMenu(null);
        },
        [createCanvasConnection, createCanvasNode, effectiveConfig.model, effectiveConfig.textModel, message],
    );

    const analyzeVideoNode = useCallback(
        async (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Video || (!node.metadata?.content && !node.metadata?.storageKey)) {
                message.warning("视频节点为空，无法解析");
                return;
            }
            const hide = message.loading("正在抽帧并解析视频分镜...", 0);
            try {
                const url = await resolveNodeContent(node);
                if (!url) throw new Error("视频内容为空，无法解析");
                const { frames, duration } = await captureVideoFrames(url);
                if (!frames.length) throw new Error("未能从视频中抽取画面帧");
                const generationConfig = buildGenerationConfig(effectiveConfig, undefined, "text");
                const messages: AiTextMessage[] = [
                    {
                        role: "user",
                        content: [{ type: "text", text: buildVideoStoryboardPrompt(frames, duration) }, ...frames.map((frame) => ({ type: "image_url" as const, image_url: { url: frame.dataUrl } }))],
                    },
                ];
                const answer = await requestImageQuestion(generationConfig, messages, () => {});
                const beats = parseVideoStoryboardResponse(answer);
                if (!beats.length) throw new Error("模型没有返回可识别的分镜表，请确认当前文本模型支持识图后重试");
                const body = buildVideoStoryboardBody(beats);
                const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
                const position = { x: node.position.x + node.width + 96, y: node.position.y + node.height / 2 - spec.height / 2 };
                const scriptNode = createCanvasNode(
                    CanvasNodeType.Text,
                    { x: position.x + spec.width / 2, y: position.y + spec.height / 2 },
                    {
                        canvasTool: "script",
                        content: body,
                        scriptTitle: `视频解析：${node.title || "视频"}`,
                        scriptBody: body,
                        scriptBeats: beats,
                        status: NODE_STATUS_SUCCESS,
                        generationMode: "text",
                        fontSize: 14,
                    },
                );
                setNodes((prev) => [...prev, scriptNode]);
                setConnections((prev) => [...prev, createCanvasConnection(node.id, scriptNode.id)]);
                setSelectedNodeIds(new Set([scriptNode.id]));
                setSelectedConnectionId(null);
                setDialogNodeId(scriptNode.id);
                message.success(`已解析出 ${beats.length} 个分镜`);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "视频解析失败");
            } finally {
                hide();
            }
        },
        [createCanvasConnection, createCanvasNode, effectiveConfig, message],
    );

    const openVideoTrim = useCallback(
        async (node: CanvasNodeData) => {
            const url = await resolveNodeContent(node);
            if (!url) {
                message.warning("视频节点为空，无法剪辑");
                return;
            }
            setTrimVideoSrc(url);
            setTrimVideoNodeId(node.id);
        },
        [message],
    );

    /** 打开图片工具弹窗前先重新解析媒体 URL（content 里的签名 URL 可能已过期，需按 storageKey 重新签名）。 */
    const openImageToolDialog = useCallback(
        async (node: CanvasNodeData, open: (id: string) => void) => {
            const url = await resolveNodeContent(node);
            if (!url) {
                message.warning("图片内容不可用，无法打开工具");
                return;
            }
            setImageToolDialogUrl(url);
            open(node.id);
        },
        [message],
    );

    const exportVideoTrimSegment = useCallback(
        async (node: CanvasNodeData, src: string, range: VideoTrimRange) => {
            const hide = message.loading("正在导出剪辑片段，耗时与片段时长相当...", 0);
            try {
                const blob = await trimVideoSegment(src, range);
                const video = await uploadMediaFile(blob, "video");
                const size = fitNodeSize(video.width || node.metadata?.naturalWidth || 1280, video.height || node.metadata?.naturalHeight || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                const position = { x: node.position.x + node.width + 96, y: node.position.y + node.height / 2 - size.height / 2 };
                const child: CanvasNodeData = {
                    ...createCanvasNode(
                        CanvasNodeType.Video,
                        { x: position.x + size.width / 2, y: position.y + size.height / 2 },
                        { ...videoMetadata(video), prompt: node.metadata?.prompt },
                    ),
                    position,
                    width: size.width,
                    height: size.height,
                };
                setNodes((prev) => [...prev, child]);
                setConnections((prev) => [...prev, createCanvasConnection(node.id, child.id)]);
                setSelectedNodeIds(new Set([child.id]));
                setSelectedConnectionId(null);
                setDialogNodeId(child.id);
                message.success("剪辑完成，已生成新视频节点");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "视频剪辑失败");
            } finally {
                hide();
            }
        },
        [createCanvasConnection, createCanvasNode, message],
    );

    const confirmVideoTrim = useCallback(
        async (range: VideoTrimRange) => {
            const node = trimVideoNode;
            const src = trimVideoSrc;
            setTrimVideoNodeId(null);
            setTrimVideoSrc("");
            if (!node || !src) return;
            await exportVideoTrimSegment(node, src, range);
        },
        [exportVideoTrimSegment, trimVideoNode, trimVideoSrc],
    );

    const openCompositionTimeline = useCallback(
        async (node: CanvasNodeData) => {
            const incoming = canvasGraph.incomingByNodeId.get(node.id) || [];
            const resolved = await Promise.all(
                incoming.map(async (connection) => {
                    const source = canvasGraph.nodeById.get(connection.fromNodeId);
                    if (!source || (source.type !== CanvasNodeType.Video && source.type !== CanvasNodeType.Audio)) return null;
                    if (!source.metadata?.content && !source.metadata?.storageKey) return null;
                    const src = await resolveNodeContent(source);
                    if (!src) return null;
                    const kind = source.type === CanvasNodeType.Video ? ("video" as const) : ("audio" as const);
                    return { id: source.id, kind, title: source.title || (kind === "video" ? "视频片段" : "音频片段"), src };
                }),
            );
            const sources = resolved.filter((item): item is CompositionSource => Boolean(item));
            const videoCount = sources.filter((item) => item.kind === "video").length;
            if (!videoCount || (videoCount < 2 && !sources.some((item) => item.kind === "audio"))) {
                message.warning("请先连接至少两个视频节点，或视频加音频节点");
                return;
            }
            setCompositionSources(sources);
            setCompositionNodeId(node.id);
        },
        [canvasGraph, message],
    );

    const exportComposition = useCallback(
        async (node: CanvasNodeData, videoClips: TimelineClip[], audioClips: TimelineClip[]) => {
            const hide = message.loading("正在合成导出视频，耗时与时间轴总时长相当...", 0);
            try {
                const blob = await composeVideoTimeline(videoClips, audioClips);
                const video = await uploadMediaFile(blob, "video");
                const size = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                const position = { x: node.position.x + node.width + 96, y: node.position.y + node.height / 2 - size.height / 2 };
                const child: CanvasNodeData = {
                    ...createCanvasNode(
                        CanvasNodeType.Video,
                        { x: position.x + size.width / 2, y: position.y + size.height / 2 },
                        { ...videoMetadata(video), prompt: node.metadata?.prompt },
                    ),
                    position,
                    width: size.width,
                    height: size.height,
                };
                setNodes((prev) => [...prev, child]);
                setConnections((prev) => [...prev, createCanvasConnection(node.id, child.id)]);
                setSelectedNodeIds(new Set([child.id]));
                setSelectedConnectionId(null);
                setDialogNodeId(child.id);
                message.success("合成完成，已生成新视频节点");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "视频合成失败");
            } finally {
                hide();
            }
        },
        [createCanvasConnection, createCanvasNode, message],
    );

    const handleCompositionExport = useCallback(
        async (videoClips: TimelineClip[], audioClips: TimelineClip[]) => {
            const node = compositionNode;
            setCompositionNodeId(null);
            if (!node) return;
            await exportComposition(node, videoClips, audioClips);
        },
        [compositionNode, exportComposition],
    );

    /** Agent 视频剪辑：给定节点 + 出入点，解析内容后走共享导出核心。 */
    const agentTrimVideo = useCallback(
        async (node: CanvasNodeData, start: number, end: number) => {
            const src = await resolveNodeContent(node);
            if (!src) {
                message.warning("无法读取视频内容");
                return;
            }
            const duration = await probeMediaDuration(src, "video");
            const range = normalizeVideoTrimRange(start, end, duration || end);
            if (!range) {
                message.warning("剪辑区间无效");
                return;
            }
            await exportVideoTrimSegment(node, src, range);
        },
        [exportVideoTrimSegment, message],
    );

    /** Agent 视频合成：按连线顺序收集上游视频/音频，探测时长后构造片段（可指定出入点）并导出。 */
    const agentComposeVideo = useCallback(
        async (node: CanvasNodeData, clipSpecs?: { nodeId: string; start?: number; end?: number }[]) => {
            const incoming = canvasGraph.incomingByNodeId.get(node.id) || [];
            const resolved = await Promise.all(
                incoming.map(async (connection) => {
                    const source = canvasGraph.nodeById.get(connection.fromNodeId);
                    if (!source || (source.type !== CanvasNodeType.Video && source.type !== CanvasNodeType.Audio)) return null;
                    if (!source.metadata?.content && !source.metadata?.storageKey) return null;
                    const src = await resolveNodeContent(source);
                    if (!src) return null;
                    const kind = source.type === CanvasNodeType.Video ? ("video" as const) : ("audio" as const);
                    return { id: source.id, kind, title: source.title || (kind === "video" ? "视频片段" : "音频片段"), src };
                }),
            );
            let sources = resolved.filter((item): item is CompositionSource => Boolean(item));
            if (clipSpecs?.length) sources = sources.filter((source) => clipSpecs.some((spec) => spec.nodeId === source.id));
            const videoCount = sources.filter((source) => source.kind === "video").length;
            if (!videoCount || (videoCount < 2 && !sources.some((source) => source.kind === "audio"))) {
                message.warning("请先连接至少两个视频节点，或视频加音频节点");
                return;
            }
            const clips = await Promise.all(
                sources.map(async (source) => {
                    const duration = await probeMediaDuration(source.src, source.kind);
                    let clip = withClipDuration(createTimelineClip(source), duration);
                    const spec = clipSpecs?.find((item) => item.nodeId === source.id);
                    if (spec && duration) {
                        const range = normalizeVideoTrimRange(spec.start ?? 0, spec.end ?? duration, duration);
                        if (range) clip = { ...clip, inPoint: range.start, outPoint: range.end };
                    }
                    return clip;
                }),
            );
            const valid = clips.filter((clip) => clip.duration);
            await exportComposition(
                node,
                valid.filter((clip) => clip.kind === "video"),
                valid.filter((clip) => clip.kind === "audio"),
            );
        },
        [canvasGraph, exportComposition, message],
    );

    const cropImageNode = useCallback(async (node: CanvasNodeData, crop: CanvasImageCropRect) => {
        if (!node.metadata?.content && !node.metadata?.storageKey) return;
        const url = await resolveNodeContent(node);
        const cropped = await cropDataUrl(url, crop);
        const image = await uploadImage(cropped);
        const width = Math.min(node.width, Math.max(220, image.width));
        const child: CanvasNodeData = {
            ...createCanvasNode(
                CanvasNodeType.Image,
                {
                    x: node.position.x + node.width + 96 + width / 2,
                    y: node.position.y + (width * (image.height / image.width)) / 2,
                },
                {
                    ...imageMetadata(image),
                    prompt: node.metadata?.prompt,
                },
            ),
            position: { x: node.position.x + node.width + 96, y: node.position.y },
            width,
            height: width * (image.height / image.width),
        };
        setNodes((prev) => [...prev, child]);
        setConnections((prev) => [...prev, createCanvasConnection(node.id, child.id)]);
        setSelectedNodeIds(new Set([child.id]));
        setDialogNodeId(child.id);
        setCropNodeId(null);
    }, [createCanvasConnection, createCanvasNode]);

    const splitImageNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageSplitParams) => {
            if (!node.metadata?.content && !node.metadata?.storageKey) return;
            setSplitNodeId(null);
            const url = await resolveNodeContent(node);
            const pieces = await splitDataUrl(url, params);
            const gap = 16;
            const cellWidth = node.width / params.columns;
            const cellHeight = node.height / params.rows;
            const startX = node.position.x + node.width + 96;
            const startY = node.position.y;
            const childNodes = await Promise.all(
                pieces.map(async (piece) => {
                    const image = await uploadImage(piece.dataUrl);
                    const position = { x: startX + piece.column * (cellWidth + gap), y: startY + piece.row * (cellHeight + gap) };
                    return {
                        ...createCanvasNode(
                            CanvasNodeType.Image,
                            { x: position.x + cellWidth / 2, y: position.y + cellHeight / 2 },
                            {
                                ...imageMetadata(image),
                                prompt: node.metadata?.prompt,
                            },
                        ),
                        position,
                        width: cellWidth,
                        height: cellHeight,
                    } satisfies CanvasNodeData;
                }),
            );
            setNodes((prev) => [...prev, ...childNodes]);
            setConnections((prev) => [...prev, ...childNodes.map((child) => createCanvasConnection(node.id, child.id))]);
            setSelectedNodeIds(new Set(childNodes.map((child) => child.id)));
            setSelectedConnectionId(null);
            setDialogNodeId(null);
            message.success(`已切分为 ${childNodes.length} 个子节点`);
        },
        [createCanvasConnection, createCanvasNode, message],
    );

    const maskEditImageNode = useCallback(
        async (node: CanvasNodeData, payload: CanvasImageMaskEditPayload) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1", size: node.metadata?.size || "auto" };
            const comfyWorkflow = payload.executor === "comfyui" && payload.comfyWorkflowId ? await getComfyWorkflow(payload.comfyWorkflowId) : null;
            if (payload.executor === "comfyui" && !comfyWorkflow) {
                message.error("所选 ComfyUI 工作流不存在或尚未发布");
                return;
            }
            if (payload.executor === "ai" && !isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const userPrompt = payload.prompt.trim();
            const prompt = payload.executor === "ai" ? `只修改蒙版透明区域，其他区域保持不变。${userPrompt}` : userPrompt;
            const source = { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey };
            const generationMetadata =
                payload.executor === "comfyui"
                    ? { generationType: "edit" as const, model: "ComfyUI", comfyWorkflowId: comfyWorkflow!.id, references: [referenceUrl(source)].filter((url): url is string => Boolean(url)) }
                    : buildImageGenerationMetadata("edit", generationConfig, 1, [source]);
            const child = createCanvasNode(
                CanvasNodeType.Image,
                { x: node.position.x + node.width + 96 + node.width / 2, y: node.position.y + node.height / 2 },
                { prompt, status: NODE_STATUS_LOADING, ...generationMetadata },
            );
            child.position = { x: node.position.x + node.width + 96, y: node.position.y };
            child.width = node.width;
            child.height = node.height;
            setMaskEditNodeId(null);
            setRunningNodeId(child.id);
            setNodes((prev) => [
                ...prev,
                child,
            ]);
            setConnections((prev) => [...prev, createCanvasConnection(node.id, child.id)]);
            setSelectedNodeIds(new Set([child.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(child.id);
            const generationJobId = nanoid();
            const controller = startGenerationRequest(child.id, node.id, child.id);
            try {
                const image =
                    payload.executor === "comfyui"
                        ? await runComfyMaskEdit(
                              comfyWorkflow!,
                              source,
                              payload.maskDataUrl,
                              userPrompt,
                              comfyui,
                              controller.signal,
                              generationJobId,
                              () => saveCanvasGenerationJobs(new Map([[child.id, generationJobId]])),
                          )
                        : await saveCanvasGenerationJobs(new Map([[child.id, generationJobId]])).then(() =>
                              requestEdit(generationConfig, prompt, [source], { id: `${node.id}-mask`, name: "mask.png", type: "image/png", dataUrl: payload.maskDataUrl }, { signal: controller.signal, jobId: generationJobId }).then((items) => items[0]),
                          );
                const uploaded = await uploadImage(image.dataUrl);
                const size = fitNodeSize(uploaded.width, uploaded.height, node.width, node.height);
                setNodes((prev) => prev.map((item) => (item.id === child.id ? { ...item, width: size.width, height: size.height, metadata: { ...item.metadata, ...imageMetadata(uploaded), generationJobId: undefined, prompt, ...generationMetadata } } : item)));
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "局部修改失败";
                message.error(errorDetails);
                setNodes((prev) => prev.map((item) => (item.id === child.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                finishGenerationRequest(child.id, controller);
                setRunningNodeId(null);
            }
        },
        [comfyui, createCanvasConnection, createCanvasNode, effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, saveCanvasGenerationJobs, startGenerationRequest],
    );

    const upscaleImageNode = useCallback(async (node: CanvasNodeData, params: CanvasImageUpscaleParams) => {
        if (!node.metadata?.content && !node.metadata?.storageKey) return;
        setUpscaleNodeId(null);
        try {
            const url = await resolveNodeContent(node);
            const upscaled = await upscaleDataUrl(url, params);
            const image = await uploadImage(upscaled);
            const size = fitNodeSize(image.width, image.height);
            const child: CanvasNodeData = {
                ...createCanvasNode(
                    CanvasNodeType.Image,
                    { x: node.position.x + node.width + 96 + size.width / 2, y: node.position.y + size.height / 2 },
                    {
                        ...imageMetadata(image),
                        prompt: node.metadata?.prompt,
                    },
                ),
                position: { x: node.position.x + node.width + 96, y: node.position.y },
                width: size.width,
                height: size.height,
            };
            setNodes((prev) => [...prev, child]);
            setConnections((prev) => [...prev, createCanvasConnection(node.id, child.id)]);
            setSelectedNodeIds(new Set([child.id]));
            setDialogNodeId(child.id);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "高清放大失败");
        }
    }, [createCanvasConnection, createCanvasNode, message]);

    const runImageReferenceEdit = useCallback(
        async (node: CanvasNodeData, prompt: string) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, [
                { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey },
            ]);
            const child = createCanvasNode(
                CanvasNodeType.Image,
                { x: node.position.x + node.width + 96 + imageConfig.width / 2, y: node.position.y + imageConfig.height / 2 },
                { prompt, status: NODE_STATUS_LOADING, ...generationMetadata },
            );
            child.position = { x: node.position.x + node.width + 96, y: node.position.y };
            child.width = imageConfig.width;
            child.height = imageConfig.height;
            setRunningNodeId(child.id);
            setNodes((prev) => [
                ...prev,
                child,
            ]);
            setConnections((prev) => [...prev, createCanvasConnection(node.id, child.id)]);
            setSelectedNodeIds(new Set([child.id]));
            setDialogNodeId(child.id);
            const generationJobId = nanoid();
            await saveCanvasGenerationJobs(new Map([[child.id, generationJobId]]));
            const controller = startGenerationRequest(child.id, node.id, child.id);
            try {
                const image = await requestEdit(
                    generationConfig,
                    prompt,
                    [{ id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey }],
                    undefined,
                    { signal: controller.signal, jobId: generationJobId },
                ).then((items) => items[0]);
                const uploaded = await uploadImage(image.dataUrl);
                const size = fitNodeSize(uploaded.width, uploaded.height, imageConfig.width, imageConfig.height);
                setNodes((prev) => prev.map((item) => (item.id === child.id ? { ...item, width: size.width, height: size.height, metadata: { ...item.metadata, ...imageMetadata(uploaded), generationJobId: undefined, prompt, ...generationMetadata } } : item)));
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                setNodes((prev) => prev.map((item) => (item.id === child.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                finishGenerationRequest(child.id, controller);
                setRunningNodeId(null);
            }
        },
        [createCanvasConnection, createCanvasNode, effectiveConfig, finishGenerationRequest, openConfigDialog, saveCanvasGenerationJobs, startGenerationRequest],
    );

    const generateAngleNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageAngleParams) => {
            setAngleNodeId(null);
            await runImageReferenceEdit(node, buildAnglePrompt(params));
        },
        [runImageReferenceEdit],
    );

    const generateImageQuickCommandNode = useCallback(
        async (node: CanvasNodeData, command: CanvasImageQuickCommand) => {
            await runImageReferenceEdit(node, buildImageQuickCommandPrompt(command.id, node.metadata?.prompt));
        },
        [runImageReferenceEdit],
    );

    const generateOutpaintNode = useCallback(
        async (node: CanvasNodeData, ratioId: string) => {
            setOutpaintNodeId(null);
            await runImageReferenceEdit(node, buildOutpaintPrompt(ratioId, node.metadata?.prompt));
        },
        [runImageReferenceEdit],
    );

    const generateLightingNode = useCallback(
        async (node: CanvasNodeData, settings: CanvasLightingSettings) => {
            setLightingNodeId(null);
            const prompt = buildLightingPrompt(settings, node.metadata?.prompt);
            if (!prompt) return;
            await runImageReferenceEdit(node, prompt);
        },
        [runImageReferenceEdit],
    );

    const generateCutoutNode = useCallback(
        async (node: CanvasNodeData) => {
            await runImageReferenceEdit(node, buildCutoutPrompt(node.metadata?.prompt));
        },
        [runImageReferenceEdit],
    );

    const generatePanorama720Node = useCallback(
        async (node: CanvasNodeData) => {
            await runImageReferenceEdit(node, buildPanorama720Prompt(node.metadata?.prompt));
        },
        [runImageReferenceEdit],
    );

    const handleFontSizeChange = useCallback((nodeId: string, fontSize: number) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, fontSize } } : node)));
    }, []);

    const handleUploadRequest = useCallback((nodeId?: string, position?: Position) => {
        uploadTargetRef.current = { nodeId, position };
        imageInputRef.current?.click();
    }, []);

    const handleImageInputChange = useCallback(
        async (event: ReactChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            const target = uploadTargetRef.current;
            if (!file || (!file.type.startsWith("image/") && !file.type.startsWith("video/") && !isAudioFile(file) && !isTextFile(file))) return;
            const targetNode = target?.nodeId ? nodesRef.current.find((node) => node.id === target.nodeId) : undefined;
            if (targetNode?.metadata?.canvasTool === "panorama360" && !file.type.startsWith("image/")) {
                message.warning("360场景只能上传图片文件");
                uploadTargetRef.current = null;
                event.target.value = "";
                return;
            }

            if (target?.nodeId) {
                if (isTextFile(file)) {
                    const content = (await file.text()).trim();
                    if (!content) {
                        message.warning("文本文件为空");
                        uploadTargetRef.current = null;
                        event.target.value = "";
                        return;
                    }
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
                    const script = isScriptTextFile(file);
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === target.nodeId
                                ? {
                                      ...node,
                                      type: CanvasNodeType.Text,
                                      position: { x: node.position.x + node.width / 2 - (script ? 220 : spec.width) / 2, y: node.position.y + node.height / 2 - (script ? 160 : spec.height) / 2 },
                                      width: script ? 220 : spec.width,
                                      height: script ? 160 : spec.height,
                                      metadata: {
                                          ...node.metadata,
                                          content,
                                          status: NODE_STATUS_SUCCESS,
                                          errorDetails: undefined,
                                          generationMode: "text",
                                          ...(script
                                              ? {
                                                    canvasTool: "script" as const,
                                                    scriptTitle: file.name.replace(/\.[^.]+$/, ""),
                                                    scriptBody: content,
                                                }
                                              : { canvasTool: undefined, scriptTitle: undefined, scriptBody: undefined }),
                                      },
                                  }
                                : node,
                        ),
                    );
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                    setDialogNodeId(target.nodeId);
                    uploadTargetRef.current = null;
                    event.target.value = "";
                    return;
                }
                if (isAudioFile(file)) {
                    const audio = await uploadMediaFile(file, "audio");
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === target.nodeId
                                ? {
                                      ...node,
                                      type: CanvasNodeType.Audio,
                                      position: { x: node.position.x + node.width / 2 - spec.width / 2, y: node.position.y + node.height / 2 - spec.height / 2 },
                                      width: spec.width,
                                      height: spec.height,
                                      metadata: { ...node.metadata, ...audioMetadata(audio), errorDetails: undefined },
                                  }
                                : node,
                        ),
                    );
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                    uploadTargetRef.current = null;
                    event.target.value = "";
                    return;
                }
                if (file.type.startsWith("video/")) {
                    const video = await uploadMediaFile(file, "video");
                    const nextSize = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === target.nodeId
                                ? {
                                      ...node,
                                      type: CanvasNodeType.Video,
                                      position: { x: node.position.x + node.width / 2 - nextSize.width / 2, y: node.position.y + node.height / 2 - nextSize.height / 2 },
                                      width: nextSize.width,
                                      height: nextSize.height,
                                      metadata: { ...node.metadata, ...videoMetadata(video), errorDetails: undefined },
                                  }
                                : node,
                        ),
                    );
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                    setDialogNodeId(target.nodeId);
                    uploadTargetRef.current = null;
                    event.target.value = "";
                    return;
                }
                let image;
                try {
                    image = await uploadImage(file);
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "图片上传失败，请重试");
                    uploadTargetRef.current = null;
                    event.target.value = "";
                    return;
                }
                const size = fitNodeSize(image.width, image.height);
                setNodes((prev) =>
                    prev.map((node) =>
                        node.id === target.nodeId
                            ? {
                                  ...node,
                                  type: CanvasNodeType.Image,
                                  width: size.width,
                                  height: size.height,
                                  metadata: {
                                      ...node.metadata,
                                      ...imageMetadata(image),
                                      errorDetails: undefined,
                                      freeResize: true,
                                      isBatchRoot: undefined,
                                      batchRootId: undefined,
                                      batchChildIds: undefined,
                                      batchUsesReferenceImages: undefined,
                                      generationType: undefined,
                                      model: undefined,
                                      size: node.metadata?.canvasTool === "panorama360" ? node.metadata.size : undefined,
                                      quality: undefined,
                                      resolution: undefined,
                                      count: undefined,
                                      references: undefined,
                                      primaryImageId: undefined,
                                      imageBatchExpanded: undefined,
                                  },
                              }
                            : node,
                    ),
                );
                setSelectedNodeIds(new Set([target.nodeId]));
                setSelectedConnectionId(null);
                setDialogNodeId(target.nodeId);
            } else {
                const position = target?.position || screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                void (isTextFile(file) ? createTextFileNode(file, position) : isAudioFile(file) ? createAudioFileNode(file, position) : file.type.startsWith("video/") ? createVideoFileNode(file, position) : createImageFileNode(file, position));
            }

            uploadTargetRef.current = null;
            event.target.value = "";
        },
        [createAudioFileNode, createImageFileNode, createTextFileNode, createVideoFileNode, message, screenToCanvas, size.height, size.width],
    );

    const handleDropFiles = useCallback(
        (files: FileList, canvasPos: { x: number; y: number }) => {
            const file = Array.from(files).find((item) => item.type.startsWith("image/") || item.type.startsWith("video/") || isAudioFile(item) || isTextFile(item));
            if (!file) return;
            void (isTextFile(file) ? createTextFileNode(file, canvasPos) : isAudioFile(file) ? createAudioFileNode(file, canvasPos) : file.type.startsWith("video/") ? createVideoFileNode(file, canvasPos) : createImageFileNode(file, canvasPos));
        },
        [createAudioFileNode, createImageFileNode, createTextFileNode, createVideoFileNode],
    );

    const pasteAssistantImage = useCallback(
        (file: File) => {
            const position = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            void createImageFileNode(file, position);
            message.success("已从剪切板添加图片");
        },
        [createImageFileNode, message, screenToCanvas, size.height, size.width],
    );

    const handleAssistantSessionsChange = useCallback((sessions: CanvasAssistantSession[], activeId: string | null) => {
        setChatSessions(sessions);
        setActiveChatId(activeId);
    }, []);

    const startTitleEditing = useCallback(() => {
        setTitleDraft(projectTitle || "未命名画布");
        setTitleEditing(true);
    }, [projectTitle]);

    const finishTitleEditing = useCallback(() => {
        const nextTitle = titleDraft.trim();
        if (nextTitle) renameProject(projectId, nextTitle);
        setTitleEditing(false);
    }, [projectId, renameProject, titleDraft]);

    const handleGenerateNode = useCallback(
        async (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string, comfyWorkflowId?: string) => {
            const sourceNode = nodesRef.current.find((node) => node.id === nodeId);
            const generationConfig = buildGenerationConfig(effectiveConfig, sourceNode, mode);
            const isComfyMode = mode === "comfyui";
            if (!isComfyMode && !isAiConfigReady(generationConfig, generationConfig.model)) {
                message.warning("请先配置当前模型渠道和 API Key");
                openConfigDialog(true);
                return;
            }

            setRunningNodeId(nodeId);
            const runController = startGenerationRequest(nodeId, nodeId, nodeId);
            const sourceTextContent = sourceNode?.type === CanvasNodeType.Text ? sourceNode.metadata?.content?.trim() || "" : "";
            const editingTextNode = mode === "text" && Boolean(sourceTextContent);
            const generationGraph = createCanvasResourceGraph(nodesRef.current, connectionsRef.current);
            const generationContext = await hydrateNodeGenerationContext(buildNodeGenerationContext(nodeId, generationGraph, editingTextNode ? `请根据要求修改以下文本。\n\n原文：\n${sourceTextContent}\n\n修改要求：\n${prompt}` : prompt));
            const effectivePrompt = generationContext.prompt.trim();
            if (runController.signal.aborted) {
                finishGenerationRequest(nodeId, runController);
                setRunningNodeId(null);
                return;
            }
            const markSourceStatus = sourceNode?.type !== CanvasNodeType.Image && !editingTextNode;
            const rawPrompt = prompt;
            if (!effectivePrompt && (mode === "text" || mode === "audio")) {
                finishGenerationRequest(nodeId, runController);
                setRunningNodeId(null);
                message.warning(mode === "audio" ? "请先输入朗读文本或连接文本节点" : "请先输入提示词或连接上游文本节点");
                setDialogNodeId(nodeId);
                return;
            }
            let pendingChildIds: string[] = [];
            if (markSourceStatus) setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt: rawPrompt, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)));

            try {
                if (mode === "comfyui") {
                    const generationJobId =
                        sourceNode?.metadata?.status === NODE_STATUS_LOADING && sourceNode.metadata.generationJobId
                            ? sourceNode.metadata.generationJobId
                            : nanoid();
                    const workflowId = comfyWorkflowId || sourceNode?.metadata?.comfyWorkflowId || comfyui.defaultWorkflowId;
                    const comfyWorkflow = workflowId ? await getComfyWorkflow(workflowId) : null;
                    if (!comfyWorkflow) throw new Error("请先在配置节点选择 ComfyUI 工作流");
                    await saveCanvasGenerationJobs(new Map([[nodeId, generationJobId]]));
                    const values = buildComfyCanvasFieldValues(comfyWorkflow, sourceNode?.metadata?.comfyFieldValues || {}, rawPrompt);
                    resolveComfyTextFields(comfyWorkflow, values, generationContext);
                    await resolveComfyMediaFields(comfyWorkflow, values, generationContext, comfyui, runController.signal);
                    const requestWorkflow = applyComfyWorkflowFields(comfyWorkflow.workflow, comfyWorkflow.fields, values);
                    const result = await runComfyWorkflow(comfyui, requestWorkflow, runController.signal, generationJobId);
                    if (!result.images.length && !result.videos.length && !result.audios.length && !result.texts.length) throw new Error("ComfyUI 没有返回任何输出");

                    const parentConfig = NODE_DEFAULT_SIZE[CanvasNodeType.ComfyUI];
                    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                    const videoConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                    const audioConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
                    const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                    const uploadedImages = await Promise.all(result.images.map((url) => uploadImage(url)));
                    const uploadedVideos = await Promise.all(result.videos.map((url) => uploadMediaFile(url, "video")));
                    const uploadedAudios = await Promise.all(result.audios.map((url) => uploadMediaFile(url, "audio")));
                    const allNodes: CanvasNodeData[] = [];
                    uploadedImages.forEach((image, index) => {
                        const imageSize = fitNodeSize(image.width, image.height, imageConfig.width, imageConfig.height);
                        allNodes.push({
                            ...createCanvasNode(
                                CanvasNodeType.Image,
                                {
                                    x: parentPosition.x + parentConfig.width + 96 + (index % 2) * (imageConfig.width + 36) + imageSize.width / 2,
                                    y: parentPosition.y + Math.floor(index / 2) * (imageConfig.height + 36) + imageSize.height / 2,
                                },
                                {
                                    prompt: rawPrompt,
                                    requestPrompt: effectivePrompt,
                                    model: "ComfyUI",
                                    comfyWorkflowId: comfyWorkflow.id,
                                    ...imageMetadata(image),
                                },
                            ),
                            position: {
                                x: parentPosition.x + parentConfig.width + 96 + (index % 2) * (imageConfig.width + 36),
                                y: parentPosition.y + Math.floor(index / 2) * (imageConfig.height + 36),
                            },
                            width: imageSize.width,
                            height: imageSize.height,
                        });
                    });
                    const imageCount = uploadedImages.length;
                    uploadedVideos.forEach((video, index) => {
                        const videoSize = fitNodeSize(video.width || videoConfig.width, video.height || videoConfig.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                        allNodes.push({
                            ...createCanvasNode(
                                CanvasNodeType.Video,
                                {
                                    x: parentPosition.x + parentConfig.width + 96 + ((imageCount + index) % 2) * (videoConfig.width + 36) + videoSize.width / 2,
                                    y: parentPosition.y + Math.floor((imageCount + index) / 2) * (videoConfig.height + 36) + videoSize.height / 2,
                                },
                                {
                                    prompt: rawPrompt,
                                    requestPrompt: effectivePrompt,
                                    model: "ComfyUI",
                                    comfyWorkflowId: comfyWorkflow.id,
                                    ...videoMetadata(video),
                                },
                            ),
                            position: {
                                x: parentPosition.x + parentConfig.width + 96 + ((imageCount + index) % 2) * (videoConfig.width + 36),
                                y: parentPosition.y + Math.floor((imageCount + index) / 2) * (videoConfig.height + 36),
                            },
                            width: videoSize.width,
                            height: videoSize.height,
                        });
                    });
                    const videoCount = uploadedVideos.length;
                    uploadedAudios.forEach((audio, index) => {
                        const colIndex = imageCount + videoCount + index;
                        allNodes.push({
                            ...createCanvasNode(
                                CanvasNodeType.Audio,
                                {
                                    x: parentPosition.x + parentConfig.width + 96 + (colIndex % 2) * (audioConfig.width + 36) + audioConfig.width / 2,
                                    y: parentPosition.y + Math.floor(colIndex / 2) * (audioConfig.height + 36) + audioConfig.height / 2,
                                },
                                {
                                    prompt: rawPrompt,
                                    requestPrompt: effectivePrompt,
                                    model: "ComfyUI",
                                    comfyWorkflowId: comfyWorkflow.id,
                                    ...audioMetadata(audio),
                                },
                            ),
                            position: {
                                x: parentPosition.x + parentConfig.width + 96 + (colIndex % 2) * (audioConfig.width + 36),
                                y: parentPosition.y + Math.floor(colIndex / 2) * (audioConfig.height + 36),
                            },
                            width: audioConfig.width,
                            height: audioConfig.height,
                        });
                    });
                    const mediaCount = imageCount + videoCount + uploadedAudios.length;
                    result.texts.forEach((output, index) => {
                        const itemIndex = mediaCount + index;
                        const position = {
                            x: parentPosition.x + parentConfig.width + 96 + (itemIndex % 2) * (textConfig.width + 36),
                            y: parentPosition.y + Math.floor(itemIndex / 2) * (textConfig.height + 36),
                        };
                        allNodes.push({
                            ...createCanvasNode(
                                CanvasNodeType.Text,
                                { x: position.x + textConfig.width / 2, y: position.y + textConfig.height / 2 },
                                {
                                    content: output.text,
                                    prompt: rawPrompt,
                                    requestPrompt: effectivePrompt,
                                    status: NODE_STATUS_SUCCESS,
                                    fontSize: 14,
                                    model: "ComfyUI",
                                    comfyWorkflowId: comfyWorkflow.id,
                                },
                            ),
                            position,
                            width: textConfig.width,
                            height: textConfig.height,
                        });
                    });
                    pendingChildIds = allNodes.map((node) => node.id);
                    setNodes((prev) => [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt: rawPrompt, status: NODE_STATUS_SUCCESS, generationJobId: undefined, errorDetails: undefined } } : node)), ...allNodes]);
                    setConnections((prev) => [...prev, ...allNodes.map((node) => createCanvasConnection(nodeId, node.id))]);
                    return;
                }

                if (mode === "image") {
                    const count = getGenerationCount(generationConfig.count);
                    const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                    const isImageNode = sourceNode?.type === CanvasNodeType.Image;
                    const isEmptyImageNode = isImageNode && !sourceNode?.metadata?.content;
                    const sourceReference =
                        isImageNode && sourceNode?.metadata?.content
                            ? [{ id: sourceNode.id, name: `${sourceNode.title || sourceNode.id}.png`, type: sourceNode.metadata.mimeType || "image/png", dataUrl: sourceNode.metadata.content, storageKey: sourceNode.metadata.storageKey }]
                            : [];
                    const referenceImages = sourceReference.length ? sourceReference : generationContext.referenceImages;
                    const generationType = referenceImages.length ? ("edit" as const) : ("generation" as const);
                    const generationMetadata = buildImageGenerationMetadata(generationType, generationConfig, count, referenceImages);
                    const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : isImageNode ? CanvasNodeType.Image : CanvasNodeType.Text];
                    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                    const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                    const gap = 96;
                    const rowGap = 36;
                    const rootPosition = {
                        x: isEmptyImageNode ? parentPosition.x : parentPosition.x + parentConfig.width + gap,
                        y: parentPosition.y + parentConfig.height / 2 - imageConfig.height / 2,
                    };
                    const rootWidth = isEmptyImageNode ? sourceNode?.width || imageConfig.width : imageConfig.width;
                    const rootHeight = isEmptyImageNode ? sourceNode?.height || imageConfig.height : imageConfig.height;
                    const rootNode: CanvasNodeData =
                        isEmptyImageNode && sourceNode
                            ? {
                                  ...sourceNode,
                                  type: CanvasNodeType.Image,
                                  position: rootPosition,
                                  width: rootWidth,
                                  height: rootHeight,
                                  metadata: {
                                      ...sourceNode.metadata,
                                      prompt: rawPrompt,
                                      requestPrompt: effectivePrompt,
                                      status: NODE_STATUS_LOADING,
                                      isBatchRoot: count > 1,
                                      batchUsesReferenceImages: referenceImages.length > 0,
                                      ...generationMetadata,
                                      imageBatchExpanded: count > 1 ? true : undefined,
                                      errorDetails: undefined,
                                  },
                              }
                            : {
                                  ...createCanvasNode(
                                      CanvasNodeType.Image,
                                      { x: rootPosition.x + rootWidth / 2, y: rootPosition.y + rootHeight / 2 },
                                      {
                                          prompt: rawPrompt,
                                          requestPrompt: effectivePrompt,
                                          status: NODE_STATUS_LOADING,
                                          isBatchRoot: count > 1,
                                          batchUsesReferenceImages: referenceImages.length > 0,
                                          ...generationMetadata,
                                          imageBatchExpanded: count > 1 ? true : undefined,
                                      },
                                  ),
                                  position: rootPosition,
                                  width: rootWidth,
                                  height: rootHeight,
                              };
                    const childNodes: CanvasNodeData[] =
                        count > 1
                            ? Array.from({ length: count }, (_, index) => {
                                  const position = {
                                      x: rootNode.position.x + rootNode.width + 120 + (index % 2) * (imageConfig.width + 36),
                                      y: rootNode.position.y + Math.floor(index / 2) * (imageConfig.height + rowGap),
                                  };
                                  return {
                                      ...createCanvasNode(
                                          CanvasNodeType.Image,
                                          { x: position.x + imageConfig.width / 2, y: position.y + imageConfig.height / 2 },
                                          {
                                              prompt: rawPrompt,
                                              requestPrompt: effectivePrompt,
                                              status: NODE_STATUS_LOADING,
                                              batchRootId: rootNode.id,
                                              ...generationMetadata,
                                          },
                                      ),
                                      position,
                                      width: imageConfig.width,
                                      height: imageConfig.height,
                                  };
                              })
                            : [];
                    const childIds = childNodes.map((node) => node.id);
                    const rootId = rootNode.id;
                    const targetIds = childIds.length ? childIds : [rootId];
                    const imageJobs = new Map(targetIds.map((targetId) => [targetId, nanoid()]));
                    pendingChildIds = isEmptyImageNode ? childIds : [rootId, ...childIds];
                    rootNode.metadata = { ...rootNode.metadata, batchChildIds: childIds.length ? childIds : undefined };
                    const batchConnections = [
                        ...(isEmptyImageNode ? [] : [createCanvasConnection(nodeId, rootId)]),
                        ...childIds.map((childId) => createCanvasConnection(rootId, childId)),
                    ];

                    setNodes((prev) => [
                        ...prev.map((node) =>
                            node.id === nodeId
                                ? isConfigNode
                                    ? {
                                          ...node,
                                          metadata: { ...node.metadata, prompt: rawPrompt, status: NODE_STATUS_LOADING, errorDetails: undefined },
                                      }
                                    : isEmptyImageNode
                                      ? {
                                            ...node,
                                            position: rootNode.position,
                                            width: rootNode.width,
                                            height: rootNode.height,
                                            metadata: { ...node.metadata, ...rootNode.metadata, errorDetails: undefined },
                                        }
                                      : isImageNode
                                        ? {
                                              ...node,
                                              metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined },
                                          }
                                        : {
                                              ...node,
                                              type: CanvasNodeType.Text,
                                              width: parentConfig.width,
                                              height: parentConfig.height,
                                              metadata: { ...node.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS, fontSize: 14, errorDetails: undefined },
                                          }
                                : node,
                        ),
                        ...(isEmptyImageNode ? [] : [rootNode]),
                        ...childNodes,
                    ]);
                    setConnections((prev) => [...prev, ...batchConnections]);
                    setSelectedNodeIds(new Set([nodeId]));
                    setSelectedConnectionId(null);
                    setDialogNodeId(nodeId);

                    await saveCanvasGenerationJobs(imageJobs);
                    const controller = runController;
                    targetIds.forEach((targetId) => startGenerationRequest(targetId, nodeId, nodeId, controller));
                    if (count > 1) startGenerationRequest(rootId, nodeId, nodeId, controller);
                    const results = await Promise.all(
                        targetIds.map(async (targetId) => {
                            try {
                                const image = referenceImages.length
                                    ? await requestEdit({ ...generationConfig, count: "1" }, effectivePrompt, referenceImages, undefined, { signal: controller.signal, jobId: imageJobs.get(targetId) }).then((items) => items[0])
                                    : await requestGeneration({ ...generationConfig, count: "1" }, effectivePrompt, { signal: controller.signal, jobId: imageJobs.get(targetId) }).then((items) => items[0]);
                                if (!image?.dataUrl) throw new Error("接口没有返回图片 URL");
                                const uploaded = await uploadImage(image.dataUrl);
                                const imageSize = fitNodeSize(uploaded.width, uploaded.height, imageConfig.width, imageConfig.height);
                                setNodes((prev) => {
                                    const root = prev.find((node) => node.id === rootId);
                                    return prev.map((node) => {
                                        if (node.id !== targetId && node.id !== rootId) return node;
                                        const center = { x: node.position.x + node.width / 2, y: node.position.y + node.height / 2 };
                                        if (node.id === rootId && (targetId === rootId || !root?.metadata?.primaryImageId))
                                            return {
                                                ...node,
                                                position: { x: center.x - imageSize.width / 2, y: center.y - imageSize.height / 2 },
                                                width: imageSize.width,
                                                height: imageSize.height,
                                                metadata: { ...node.metadata, ...imageMetadata(uploaded), generationJobId: undefined, primaryImageId: targetId },
                                            };
                                        if (node.id === targetId)
                                            return {
                                                ...node,
                                                position: { x: center.x - imageSize.width / 2, y: center.y - imageSize.height / 2 },
                                                width: imageSize.width,
                                                height: imageSize.height,
                                                metadata: { ...node.metadata, ...imageMetadata(uploaded), generationJobId: undefined },
                                            };
                                        return node;
                                    });
                                });
                                if (isConfigNode) setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : node)));
                                return { ok: true as const, targetId };
                            } catch (error) {
                                if (isGenerationCanceled(error)) return { ok: false as const, targetId, canceled: true };
                                const errorDetails = error instanceof Error ? error.message : "生成失败";
                                setNodes((prev) => prev.map((node) => (node.id === targetId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } } : node)));
                                return { ok: false as const, targetId, errorDetails };
                            } finally {
                                finishGenerationRequest(targetId, controller);
                            }
                        }),
                    );
                    if (count > 1) finishGenerationRequest(rootId, controller);
                    if (controller.signal.aborted) {
                        setNodes((prev) => prev.map((node) => (node.id === nodeId && isConfigNode && node.metadata?.status === NODE_STATUS_LOADING ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_IDLE, errorDetails: undefined } } : node)));
                        return;
                    }
                    const hasSuccess = results.some((result) => result.ok);
                    const failedResults = results.filter((result) => !result.ok && !("canceled" in result));
                    const hasFailure = failedResults.length > 0;
                    const firstErrorDetails = failedResults.find((result) => "errorDetails" in result)?.errorDetails || "全部图片生成失败";
                    if (hasFailure) message.error(hasSuccess ? "部分图片生成失败" : firstErrorDetails);
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === nodeId && isConfigNode
                                ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : firstErrorDetails } }
                                : node.id === nodeId && isEmptyImageNode
                                  ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : firstErrorDetails } }
                                  : node.id === rootId && !hasSuccess
                                    ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails: node.metadata?.errorDetails || firstErrorDetails } }
                                    : node,
                        ),
                    );
                    return;
                }

                if (mode === "video") {
                    const spec = nodeSizeFromRatio(generationConfig.size, NODE_DEFAULT_SIZE[CanvasNodeType.Video].width, NODE_DEFAULT_SIZE[CanvasNodeType.Video].height) || NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                    const isEmptyVideoNode = sourceNode?.type === CanvasNodeType.Video && !sourceNode.metadata?.content;
                    const parent = sourceNode?.position || { x: 0, y: 0 };
                    const videoPosition = isEmptyVideoNode && sourceNode ? sourceNode.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y };
                    const videoWidth = isEmptyVideoNode && sourceNode ? sourceNode.width : spec.width;
                    const videoHeight = isEmptyVideoNode && sourceNode ? sourceNode.height : spec.height;
                    // 视频主体库：选中主体时把主体参考图集并入参考图（追加在连线参考之后，避免抢占首帧位）
                    const videoSubject = resolveVideoSubject(effectiveConfig.videoSubjects, sourceNode?.metadata?.videoSubjectId);
                    const videoReferenceImages = videoSubject ? [...generationContext.referenceImages, ...videoSubjectReferenceImages(videoSubject)] : generationContext.referenceImages;
                    const pendingVideoMeta = {
                        prompt: rawPrompt,
                        requestPrompt: effectivePrompt,
                        status: NODE_STATUS_LOADING,
                        model: generationConfig.model,
                        size: generationConfig.size,
                        seconds: generationConfig.videoSeconds,
                        vquality: generationConfig.vquality,
                        generateAudio: generationConfig.videoGenerateAudio,
                        watermark: generationConfig.videoWatermark,
                        draft: generationConfig.videoDraft,
                        videoGenerationMode: sourceNode?.metadata?.videoGenerationMode,
                        videoSubjectId: sourceNode?.metadata?.videoSubjectId,
                        references: generationReferenceUrls({ ...generationContext, referenceImages: videoReferenceImages }),
                        errorDetails: undefined,
                    };
                    const videoNode: CanvasNodeData =
                        isEmptyVideoNode && sourceNode
                            ? { ...sourceNode, type: CanvasNodeType.Video, position: videoPosition, width: videoWidth, height: videoHeight, metadata: { ...sourceNode.metadata, ...pendingVideoMeta } }
                            : {
                                  ...createCanvasNode(CanvasNodeType.Video, { x: videoPosition.x + videoWidth / 2, y: videoPosition.y + videoHeight / 2 }, pendingVideoMeta),
                                  position: videoPosition,
                                  width: videoWidth,
                                  height: videoHeight,
                              };
                    const videoId = videoNode.id;
                    pendingChildIds = [videoId];
                    setNodes((prev) =>
                        isEmptyVideoNode
                            ? prev.map((node) => (node.id === nodeId ? { ...node, ...videoNode } : node))
                            : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), videoNode],
                    );
                    if (!isEmptyVideoNode) setConnections((prev) => [...prev, createCanvasConnection(nodeId, videoId)]);
                    const generationJobId = nanoid();
                    await saveCanvasGenerationJobs(new Map([[videoId, generationJobId]]));
                    const controller = startGenerationRequest(videoId, nodeId, nodeId, runController);
                    const task = await createVideoGenerationTask(generationConfig, effectivePrompt, videoReferenceImages, generationContext.referenceVideos, generationContext.referenceAudios, {
                        signal: controller.signal,
                        jobId: generationJobId,
                        generationMode: sourceNode?.metadata?.videoGenerationMode,
                    });
                    const startedAt = Date.now();
                    await saveCanvasVideoTask(videoId, task, startedAt);
                    await finishCanvasVideoTask(videoId, generationConfig, task, startedAt, controller);
                    return;
                }

                if (mode === "audio") {
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    const isEmptyAudioNode = sourceNode?.type === CanvasNodeType.Audio && !sourceNode.metadata?.content;
                    const parent = sourceNode?.position || { x: 0, y: 0 };
                    const audioPosition = isEmptyAudioNode && sourceNode ? sourceNode.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y + ((sourceNode?.height || spec.height) - spec.height) / 2 };
                    const audioWidth = isEmptyAudioNode && sourceNode ? sourceNode.width : spec.width;
                    const audioHeight = isEmptyAudioNode && sourceNode ? sourceNode.height : spec.height;
                    const pendingAudioMeta = { prompt: rawPrompt, requestPrompt: effectivePrompt, status: NODE_STATUS_LOADING, ...buildAudioGenerationMetadata(generationConfig), errorDetails: undefined };
                    const audioNode: CanvasNodeData =
                        isEmptyAudioNode && sourceNode
                            ? { ...sourceNode, type: CanvasNodeType.Audio, position: audioPosition, width: audioWidth, height: audioHeight, metadata: { ...sourceNode.metadata, ...pendingAudioMeta } }
                            : {
                                  ...createCanvasNode(CanvasNodeType.Audio, { x: audioPosition.x + audioWidth / 2, y: audioPosition.y + audioHeight / 2 }, pendingAudioMeta),
                                  position: audioPosition,
                                  width: audioWidth,
                                  height: audioHeight,
                              };
                    const audioId = audioNode.id;
                    pendingChildIds = [audioId];
                    setNodes((prev) =>
                        isEmptyAudioNode
                            ? prev.map((node) => (node.id === nodeId ? { ...node, ...audioNode } : node))
                            : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), audioNode],
                    );
                    if (!isEmptyAudioNode) setConnections((prev) => [...prev, createCanvasConnection(nodeId, audioId)]);
                    const generationJobId = nanoid();
                    await saveCanvasGenerationJobs(new Map([[audioId, generationJobId]]));
                    const controller = startGenerationRequest(audioId, nodeId, nodeId, runController);
                    try {
                        const audio = await storeGeneratedAudio(await requestAudioGeneration(generationConfig, effectivePrompt, { signal: controller.signal, jobId: generationJobId }), generationConfig.audioFormat);
                        setNodes((prev) =>
                            prev.map((node) => (node.id === audioId ? { ...node, metadata: { ...node.metadata, ...audioMetadata(audio), generationJobId: undefined, prompt: rawPrompt, requestPrompt: effectivePrompt, ...buildAudioGenerationMetadata(generationConfig) } } : node)),
                        );
                    } finally {
                        finishGenerationRequest(audioId, controller);
                    }
                    return;
                }

                let streamed = "";
                const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                const textCount = isConfigNode ? getGenerationCount(generationConfig.count) : 1;
                const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : CanvasNodeType.Text];
                const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
                const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                const childNodes: CanvasNodeData[] =
                    isConfigNode || editingTextNode
                        ? Array.from({ length: textCount }, (_, index) => {
                              const position = {
                                  x: parentPosition.x + parentConfig.width + 96,
                                  y: parentPosition.y + parentConfig.height / 2 - textConfig.height / 2 + (index - (textCount - 1) / 2) * (textConfig.height + 36),
                              };
                              return {
                                  ...createCanvasNode(
                                      CanvasNodeType.Text,
                                      { x: position.x + textConfig.width / 2, y: position.y + textConfig.height / 2 },
                                      { prompt: rawPrompt, requestPrompt: effectivePrompt, status: NODE_STATUS_LOADING, fontSize: 14 },
                                  ),
                                  position,
                                  width: textConfig.width,
                                  height: textConfig.height,
                              };
                          })
                        : [];
                const childIds = childNodes.map((node) => node.id);
                pendingChildIds = childIds;
                if (isConfigNode || editingTextNode) {
                    setNodes((prev) => [...prev.map((node) => (node.id === nodeId && isConfigNode ? { ...node, metadata: { ...node.metadata, prompt: rawPrompt, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)), ...childNodes]);
                    setConnections((prev) => [...prev, ...childIds.map((childId) => createCanvasConnection(nodeId, childId))]);
                }

                const controller = runController;
                const textTargetIds = childIds.length ? childIds : [nodeId];
                const textJobs = new Map(textTargetIds.map((targetNodeId) => [targetNodeId, nanoid()]));
                await saveCanvasGenerationJobs(textJobs);
                textTargetIds.forEach((targetNodeId) => startGenerationRequest(targetNodeId, nodeId, nodeId, controller));
                const answers = await Promise.all(
                    textTargetIds.map((targetNodeId) => {
                        let localStreamed = "";
                        return requestImageQuestion(
                            generationConfig,
                            buildNodeResponseMessages({ ...generationContext, prompt: effectivePrompt }),
                            (text) => {
                                localStreamed = text;
                                streamed = text;
                                if (isConfigNode) return;
                                setNodes((prev) => prev.map((node) => (node.id === targetNodeId ? { ...node, type: CanvasNodeType.Text, metadata: { ...node.metadata, content: text, status: NODE_STATUS_LOADING } } : node)));
                            },
                            { signal: controller.signal, jobId: textJobs.get(targetNodeId) },
                        )
                            .then((answer) => ({ nodeId: targetNodeId, content: answer || localStreamed }))
                            .finally(() => finishGenerationRequest(targetNodeId, controller));
                    }),
                );
                if (controller.signal.aborted) return;
                const answerByNodeId = new Map(answers.map((item) => [item.nodeId, item.content]));
                setNodes((prev) =>
                    prev.map((node) =>
                        childIds.includes(node.id)
                            ? { ...node, metadata: { ...node.metadata, content: answerByNodeId.get(node.id) || streamed, status: NODE_STATUS_SUCCESS, generationJobId: undefined } }
                            : node.id === nodeId && isConfigNode
                              ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } }
                            : node.id === nodeId && !editingTextNode
                                ? { ...node, type: CanvasNodeType.Text, metadata: { ...node.metadata, content: answerByNodeId.get(node.id) || streamed, status: NODE_STATUS_SUCCESS, generationJobId: undefined } }
                                : node,
                    ),
                );
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                message.error(errorDetails);
                setNodes((prev) =>
                    prev.map((node) => (node.id === nodeId || pendingChildIds.includes(node.id) ? (node.id === nodeId && !markSourceStatus ? node : { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } }) : node)),
                );
            } finally {
                finishGenerationRequest(nodeId, runController);
                setRunningNodeId(null);
            }
        },
        [comfyui, createCanvasConnection, createCanvasNode, effectiveConfig, finishCanvasVideoTask, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, saveCanvasGenerationJobs, saveCanvasVideoTask, startGenerationRequest],
    );
    useEffect(() => {
        generateNodeRef.current = handleGenerateNode;
    }, [handleGenerateNode]);

    const handleRetryNode = useCallback(
        async (node: CanvasNodeData, resume = false) => {
            if (node.type === CanvasNodeType.ComfyUI) {
                await generateNodeRef.current?.(node.id, "comfyui", node.metadata?.composerContent ?? node.metadata?.prompt ?? "");
                return;
            }
            if (resume && node.type === CanvasNodeType.Image && node.metadata?.model === "ComfyUI" && node.metadata.comfyWorkflowId && node.metadata.generationJobId) {
                const workflow = await getComfyWorkflow(node.metadata.comfyWorkflowId);
                if (!workflow) {
                    setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "ComfyUI 工作流已不存在，无法恢复任务。" } } : item)));
                    return;
                }
                const controller = startGenerationRequest(node.id, node.id, node.id);
                setRunningNodeId(node.id);
                try {
                    const result = await runComfyWorkflow(comfyui, workflow.workflow, controller.signal, node.metadata.generationJobId);
                    if (!result.images.length) throw new Error("ComfyUI 任务没有返回图片");
                    const uploaded = await uploadImage(result.images[0]);
                    const size = fitNodeSize(uploaded.width, uploaded.height, node.width, node.height);
                    setNodes((prev) => prev.map((item) => (
                        item.id === node.id
                            ? { ...item, width: size.width, height: size.height, metadata: { ...item.metadata, ...imageMetadata(uploaded), generationJobId: undefined, errorDetails: undefined } }
                            : item
                    )));
                } catch (error) {
                    if (!isGenerationCanceled(error)) {
                        const errorDetails = error instanceof Error ? error.message : "ComfyUI 任务恢复失败";
                        setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
                    }
                } finally {
                    finishGenerationRequest(node.id, controller);
                    setRunningNodeId(null);
                }
                return;
            }
            const sourceNode = findRetrySourceNode(node.id, nodeByIdRef.current, connectionAdjacency.incomingByNodeId) || node;
            const batchRoot = node.metadata?.batchRootId ? nodesRef.current.find((item) => item.id === node.metadata?.batchRootId) : null;
            const savedImageMetadata = node.type === CanvasNodeType.Image ? { ...batchRoot?.metadata, ...node.metadata } : undefined;
            const hasSavedImageMetadata = Boolean(savedImageMetadata?.generationType);
            const generationConfig =
                hasSavedImageMetadata && savedImageMetadata
                    ? {
                          ...effectiveConfig,
                          model: savedImageMetadata.model || effectiveConfig.imageModel || effectiveConfig.model,
                          quality: savedImageMetadata.quality || effectiveConfig.quality,
                          resolution: savedImageMetadata.resolution || effectiveConfig.resolution,
                          size: savedImageMetadata.size || effectiveConfig.size,
                          count: "1",
                      }
                    : { ...buildGenerationConfig(effectiveConfig, sourceNode, node.type === CanvasNodeType.Text ? "text" : node.type === CanvasNodeType.Video ? "video" : node.type === CanvasNodeType.Audio ? "audio" : "image"), count: "1" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            const retryGraph = createCanvasResourceGraph(nodesRef.current, connectionsRef.current);
            const context = hasSavedImageMetadata ? null : await hydrateNodeGenerationContext(buildNodeGenerationContext(sourceNode.id, retryGraph, sourceNode.metadata?.prompt || node.metadata?.prompt || ""));
            const prompt = (savedImageMetadata?.requestPrompt || savedImageMetadata?.prompt || context?.prompt || "").trim();
            if (!prompt) {
                message.warning("找不到提示词，无法重试");
                return;
            }
            const generationType = savedImageMetadata?.generationType;
            const useReferenceImages = generationType ? generationType === "edit" : Boolean(context?.referenceImages.length);
            const retryReferenceImages =
                hasSavedImageMetadata && savedImageMetadata ? await resolveMetadataReferences(savedImageMetadata) : useReferenceImages ? (context?.referenceImages.length ? context.referenceImages : sourceNodeReferenceImages(batchRoot || sourceNode)) : [];
            if (useReferenceImages && !retryReferenceImages) {
                message.error("参考图片已丢失，无法继续重试");
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "参考图片已丢失，无法继续重试" } } : item)));
                return;
            }
            const retryImages = retryReferenceImages || [];
            const generationJobId = resume && node.metadata?.generationJobId ? node.metadata.generationJobId : nanoid();

            setRunningNodeId(node.id);
            setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined } } : item)));
            await saveCanvasGenerationJobs(new Map([[node.id, generationJobId]]));
            const controller = startGenerationRequest(node.id, sourceNode.id, node.id);

            try {
                if (node.type === CanvasNodeType.Text) {
                    if (!context) return;
                    let streamed = "";
                    const answer = await requestImageQuestion(
                        generationConfig,
                        buildNodeResponseMessages({ ...context, prompt }),
                        (text) => {
                            streamed = text;
                            setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: text, status: NODE_STATUS_LOADING } } : item)));
                        },
                        { signal: controller.signal, jobId: generationJobId },
                    );
                    setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: answer || streamed, prompt, status: NODE_STATUS_SUCCESS, generationJobId: undefined } } : item)));
                    return;
                }
                if (node.type === CanvasNodeType.Video) {
                    const videoGenerationMode = node.metadata?.videoGenerationMode ?? sourceNode.metadata?.videoGenerationMode;
                    const task = await createVideoGenerationTask(generationConfig, prompt, retryImages, context?.referenceVideos || [], context?.referenceAudios || [], { signal: controller.signal, jobId: generationJobId, generationMode: videoGenerationMode });
                    const startedAt = Date.now();
                    await saveCanvasVideoTask(node.id, task, startedAt);
                    await finishCanvasVideoTask(node.id, generationConfig, task, startedAt, controller);
                    return;
                }
                if (node.type === CanvasNodeType.Audio) {
                    const audio = await storeGeneratedAudio(await requestAudioGeneration(generationConfig, prompt, { signal: controller.signal, jobId: generationJobId }), generationConfig.audioFormat);
                    setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...audioMetadata(audio), generationJobId: undefined, prompt, ...buildAudioGenerationMetadata(generationConfig) } } : item)));
                    return;
                }

                const image = useReferenceImages
                    ? await requestEdit(generationConfig, prompt, retryImages, undefined, { signal: controller.signal, jobId: generationJobId }).then((items) => items[0])
                    : await requestGeneration(generationConfig, prompt, { signal: controller.signal, jobId: generationJobId }).then((items) => items[0]);
                const uploadedImage = await uploadImage(image.dataUrl);
                const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                const imageSize = fitNodeSize(uploadedImage.width, uploadedImage.height, imageConfig.width, imageConfig.height);
                const generationMetadata = savedImageMetadata?.generationType
                    ? { generationType: savedImageMetadata.generationType, model: generationConfig.model, size: generationConfig.size, quality: generationConfig.quality, resolution: generationConfig.resolution, count: savedImageMetadata.count || 1, references: savedImageMetadata.references }
                    : buildImageGenerationMetadata(useReferenceImages ? "edit" : "generation", generationConfig, 1, retryImages);
                setNodes((prev) =>
                    prev.map((item) =>
                        item.id === node.id
                            ? {
                                  ...item,
                                  type: CanvasNodeType.Image,
                                  width: imageSize.width,
                                  height: imageSize.height,
                                  metadata: { ...item.metadata, ...imageMetadata(uploadedImage), generationJobId: undefined, prompt, ...generationMetadata },
                              }
                            : item,
                    ),
                );
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                message.error(errorDetails);
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                finishGenerationRequest(node.id, controller);
                setRunningNodeId(null);
            }
        },
        [comfyui, connectionAdjacency, effectiveConfig, finishCanvasVideoTask, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, saveCanvasGenerationJobs, saveCanvasVideoTask, startGenerationRequest],
    );

    useEffect(() => {
        if (!projectLoaded) return;
        const resumeKey = `${saveMode}:${user?.id || "anonymous"}:${projectId}`;
        if (resumedGenerationProjectKeyRef.current === resumeKey) return;
        resumedGenerationProjectKeyRef.current = resumeKey;

        nodesRef.current.forEach((node) => {
            if (
                node.metadata?.status !== NODE_STATUS_LOADING
                || !node.metadata.generationJobId
                || node.metadata.videoTask
                || generationRequestsRef.current.has(node.id)
            ) return;
            void handleRetryNode(node, true);
        });
    }, [handleRetryNode, projectId, projectLoaded, saveMode, user?.id]);

    const insertAssistantImage = useCallback(
        async (image: CanvasAssistantImage) => {
            const storedImage = image.storageKey
                ? { url: image.dataUrl, storageKey: image.storageKey, width: image.width || 1, height: image.height || 1, bytes: image.bytes || 0, mimeType: image.mimeType || "image/png" }
                : await uploadImage(image.dataUrl);
            const meta = storedImage.width === 1 && storedImage.height === 1 ? await readImageMeta(storedImage.url) : storedImage;
            const config = fitNodeSize(meta.width, meta.height);
            const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const node: CanvasNodeData = {
                ...createCanvasNode(CanvasNodeType.Image, center, { ...imageMetadata({ ...storedImage, width: meta.width, height: meta.height }), prompt: image.prompt }),
                position: { x: center.x - config.width / 2, y: center.y - config.height / 2 },
                width: config.width,
                height: config.height,
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(node.id);
        },
        [createCanvasNode, screenToCanvas, size.height, size.width],
    );

    const insertAssistantText = useCallback(
        (text: string) => {
            const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const node = createCanvasNode(CanvasNodeType.Text, center, { content: text, status: NODE_STATUS_SUCCESS });

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
        },
        [screenToCanvas, size.height, size.width],
    );

    const openAssetPicker = useCallback((nodeId?: string) => {
        setAssetPickerTargetNodeId(nodeId || null);
        setAssetPickerOpen(true);
    }, []);

    const handleAssetInsert = useCallback(
        (payload: InsertAssetPayload) => {
            const target = assetPickerTargetNodeId ? nodesRef.current.find((node) => node.id === assetPickerTargetNodeId) : null;
            const replaceTarget = (patch: Partial<CanvasNodeData>, nextSize?: { width: number; height: number }) => {
                if (!target) return false;
                const nextNodes = nodesRef.current.map((node) => (node.id === target.id ? { ...node, ...patch, ...(nextSize || {}), title: payload.title || node.title } : node));
                nodesRef.current = nextNodes;
                setNodes(nextNodes);
                setSelectedNodeIds(new Set([target.id]));
                setSelectedConnectionId(null);
                setDialogNodeId(target.id);
                return true;
            };

            if (payload.kind === "text" && target?.type === CanvasNodeType.Text) {
                replaceTarget({ metadata: { ...target.metadata, content: payload.content, status: NODE_STATUS_SUCCESS } });
            } else if (payload.kind === "image" && target?.type === CanvasNodeType.Image) {
                const nextSize = fitNodeSize(payload.width, payload.height, NODE_DEFAULT_SIZE[CanvasNodeType.Image].width, NODE_DEFAULT_SIZE[CanvasNodeType.Image].height);
                replaceTarget(
                    { metadata: { ...target.metadata, content: payload.dataUrl, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS, naturalWidth: payload.width, naturalHeight: payload.height, bytes: payload.bytes, mimeType: payload.mimeType } },
                    nextSize,
                );
            } else if (payload.kind === "video" && target?.type === CanvasNodeType.Video) {
                const nextSize = fitNodeSize(payload.width || NODE_DEFAULT_SIZE[CanvasNodeType.Video].width, payload.height || NODE_DEFAULT_SIZE[CanvasNodeType.Video].height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                replaceTarget(
                    { metadata: { ...target.metadata, content: payload.url, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS, naturalWidth: payload.width, naturalHeight: payload.height } },
                    nextSize,
                );
            } else if (payload.kind === "audio" && target?.type === CanvasNodeType.Audio) {
                replaceTarget({ metadata: { ...target.metadata, content: payload.url, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS, mimeType: payload.mimeType || "audio/mpeg", durationMs: payload.durationMs } });
            } else if (payload.kind === "text") {
                insertAssistantText(payload.content);
            } else if (payload.kind === "video") {
                const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                const nextSize = fitNodeSize(payload.width || spec.width, payload.height || spec.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                const node = {
                    ...createCanvasNode(CanvasNodeType.Video, center, { content: payload.url, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS, naturalWidth: payload.width, naturalHeight: payload.height }),
                    position: { x: center.x - nextSize.width / 2, y: center.y - nextSize.height / 2 },
                    width: nextSize.width,
                    height: nextSize.height,
                };
                setNodes((prev) => [
                    ...prev,
                    node,
                ]);
                setSelectedNodeIds(new Set([node.id]));
                setSelectedConnectionId(null);
            } else if (payload.kind === "audio") {
                const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                const node = {
                    ...createCanvasNode(CanvasNodeType.Audio, center, { content: payload.url, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS, mimeType: payload.mimeType || "audio/mpeg", durationMs: payload.durationMs }),
                    position: { x: center.x - spec.width / 2, y: center.y - spec.height / 2 },
                    width: spec.width,
                    height: spec.height,
                };
                setNodes((prev) => [
                    ...prev,
                    node,
                ]);
                setSelectedNodeIds(new Set([node.id]));
                setSelectedConnectionId(null);
            } else {
                insertAssistantImage({
                    id: `asset-${Date.now()}`,
                    prompt: payload.title,
                    dataUrl: payload.dataUrl,
                    storageKey: payload.storageKey,
                    width: payload.width,
                    height: payload.height,
                    bytes: payload.bytes,
                    mimeType: payload.mimeType,
                });
            }
            setAssetPickerOpen(false);
            setAssetPickerTargetNodeId(null);
        },
        [assetPickerTargetNodeId, createCanvasNode, insertAssistantImage, insertAssistantText, screenToCanvas, size.height, size.width],
    );

    const openMaterialLibrary = useCallback((tab: "styles" | "effects" | "assets" = "styles") => {
        setMaterialLibraryTab(tab);
        setMaterialLibraryOpen(true);
    }, []);

    /** 统一创建菜单（dock +、双击空白、右键空白共用）的动作分发。 */
    const handleCreateMenuAction = useCallback(
        (action: CanvasCreateMenuAction, position?: Position) => {
            const options = position ? { position } : undefined;
            switch (action) {
                case "text":
                    createNode(CanvasNodeType.Text, options);
                    break;
                case "image":
                    createNode(CanvasNodeType.Image, options);
                    break;
                case "video":
                    createNode(CanvasNodeType.Video, options);
                    break;
                case "audio":
                    createNode(CanvasNodeType.Audio, options);
                    break;
                case "comfyui":
                    createNode(CanvasNodeType.ComfyUI, options);
                    break;
                case "script":
                    createScriptNode();
                    break;
                case "videoComposition":
                    createVideoCompositionNode();
                    break;
                case "director":
                    createDirectorNode();
                    break;
                case "panorama360":
                    createPanorama360Node();
                    break;
                case "materialLibrary":
                    openMaterialLibrary("styles");
                    break;
                case "upload":
                    handleUploadRequest();
                    break;
                case "generationHistory":
                    setGenerationHistoryOpen(true);
                    break;
            }
        },
        [createNode, createScriptNode, createVideoCompositionNode, createDirectorNode, createPanorama360Node, openMaterialLibrary, handleUploadRequest],
    );

    const insertMaterialPreset = useCallback(
        (preset: { title: string; prompt: string }) => {
            const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const node = {
                ...createCanvasNode(CanvasNodeType.Text, center, { content: preset.prompt, status: NODE_STATUS_SUCCESS, fontSize: 13, generationMode: "text", prompt: preset.prompt }),
                width: 220,
                height: 132,
            };
            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(node.id);
            setMaterialLibraryOpen(false);
        },
        [screenToCanvas, size.height, size.width],
    );

    const insertVideoFrameCapture = useCallback(async (sourceNode: CanvasNodeData, dataUrl: string, kind: "first" | "current" | "last") => {
        const videoNode = nodesRef.current.find((node) => node.id === sourceNode.id && node.type === CanvasNodeType.Video);
        if (!videoNode) {
            message.error("源视频节点已不存在");
            return;
        }
        const frameLabel = kind === "first" ? "首帧" : kind === "last" ? "尾帧" : "当前帧";
        try {
            const image = await uploadImage(dataUrl);
            const size = fitNodeSize(image.width, image.height);
            const frameNode = {
                ...createCanvasNode(
                    CanvasNodeType.Image,
                    {
                        x: videoNode.position.x + videoNode.width + 64 + size.width / 2,
                        y: videoNode.position.y + videoNode.height / 2,
                    },
                    {
                        ...imageMetadata(image),
                        freeResize: true,
                        status: NODE_STATUS_SUCCESS,
                    },
                ),
                width: size.width,
                height: size.height,
            } satisfies CanvasNodeData;
            setNodes((previous) => [...previous, frameNode]);
            setConnections((previous) => [...previous, createCanvasConnection(videoNode.id, frameNode.id)]);
            setSelectedNodeIds(new Set([frameNode.id]));
            setSelectedConnectionId(null);
            message.success(`${frameLabel}已插入画布`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "视频截帧插入失败");
            throw error;
        }
    }, [createCanvasConnection, createCanvasNode, message]);

    const insertDirectorCaptures = useCallback(
        async (directorNodeId: string, captures: DirectorDeskCapture[]) => {
            const directorNode = nodesRef.current.find((node) => node.id === directorNodeId);
            if (!directorNode) throw new Error("导演台节点已不存在");
            if (captures.length === 0) throw new Error("没有可插入的导演台截图");

            try {
                const gap = 44;
                const createdNodes: CanvasNodeData[] = [];
                for (const [index, capture] of captures.entries()) {
                    const image = await uploadImage(capture.dataUrl);
                    const imageSize = fitNodeSize(image.width, image.height);
                    const position = {
                        x: directorNode.position.x + directorNode.width + 120 + index * (imageSize.width + gap),
                        y: directorNode.position.y + index * 34,
                    };
                    createdNodes.push({
                        ...createCanvasNode(
                            CanvasNodeType.Image,
                            { x: position.x + imageSize.width / 2, y: position.y + imageSize.height / 2 },
                            {
                                ...imageMetadata(image),
                                prompt: `来自 ${directorNode.title} 的 3D 机位截图`,
                                generationMode: "image",
                                generationType: "generation",
                                freeResize: true,
                                status: NODE_STATUS_SUCCESS,
                            },
                        ),
                        position,
                        width: imageSize.width,
                        height: imageSize.height,
                    });
                }
                const outputIds = createdNodes.map((node) => node.id);
                setNodes((previous) => [
                    ...previous.map((node) =>
                        node.id === directorNodeId
                            ? {
                                  ...node,
                                  metadata: {
                                      ...node.metadata,
                                      directorOutputIds: [...(node.metadata?.directorOutputIds || []), ...outputIds],
                                      status: NODE_STATUS_SUCCESS,
                                  },
                              }
                            : node,
                    ),
                    ...createdNodes,
                ]);
                setConnections((previous) => [...previous, ...createdNodes.map((node) => createCanvasConnection(directorNodeId, node.id))]);
                setSelectedNodeIds(new Set(outputIds));
                setSelectedConnectionId(null);
                message.success(`${createdNodes.length} 张导演台截图已插入画布`);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "导演台截图插入失败");
                throw error;
            }
        },
        [createCanvasConnection, createCanvasNode, message],
    );

    const createScriptStoryboard = useCallback(
        (scriptNode: CanvasNodeData) => {
            const body = scriptNode.metadata?.scriptBody?.trim() || scriptNode.metadata?.content?.trim() || DEFAULT_SCRIPT_BODY;
            const assets = scriptNode.metadata?.scriptAssets ?? [];
            const { beats: parsedBeats, acts: parsedActs } = buildScriptBeatsWithActs(body);
            const beats = parsedBeats.map((beat) => ({ ...beat, prompt: buildScriptBeatPrompt(beat, assets) }));
            const gap = 36;
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const startX = scriptNode.position.x + scriptNode.width + 96;
            const startY = scriptNode.position.y;
            const beatNodes = beats.map((beat, index) => {
                const position = { x: startX + index * (spec.width + gap), y: startY };
                return {
                    ...createCanvasNode(
                        CanvasNodeType.Image,
                        { x: position.x + spec.width / 2, y: position.y + spec.height / 2 },
                        {
                            status: NODE_STATUS_IDLE,
                            prompt: beat.prompt,
                            generationMode: "image",
                            generationType: "generation",
                        },
                    ),
                    position,
                    width: spec.width,
                    height: spec.height,
                } satisfies CanvasNodeData;
            });
            const outputIds = beatNodes.map((node) => node.id);
            nodesRef.current = [...nodesRef.current, ...beatNodes];
            connectionsRef.current = [...connectionsRef.current, ...beatNodes.map((node) => createCanvasConnection(scriptNode.id, node.id))];
            setNodes((prev) => [
                ...prev.map((node) => (node.id === scriptNode.id ? { ...node, metadata: { ...node.metadata, scriptBody: body, content: body, scriptBeats: beats, scriptActs: parsedActs.length ? parsedActs : undefined, scriptOutputIds: outputIds, status: NODE_STATUS_SUCCESS } } : node)),
                ...beatNodes,
            ]);
            setConnections((prev) => [...prev, ...beatNodes.map((node) => createCanvasConnection(scriptNode.id, node.id))]);
            setSelectedNodeIds(new Set(outputIds));
            setSelectedConnectionId(null);
            setDialogNodeId(null);
            message.success(`已拆出 ${beatNodes.length} 个分镜，可在工作台逐镜微调后生成`);
        },
        [createCanvasConnection, createCanvasNode, message],
    );

    const createScriptBeatNode = useCallback(
        (scriptNode: CanvasNodeData, beat: CanvasScriptBeat, beatIndex: number, target: "video" | "comfyui" = "video") => {
            // 同一分镜重复生成时先替换旧输出节点，避免画布上叠加
            const oldOutputId = scriptNode.metadata?.scriptBeatOutputs?.[beat.id];
            if (oldOutputId && nodesRef.current.some((node) => node.id === oldOutputId)) {
                deleteNodes(new Set([oldOutputId]));
                connectionsRef.current = connectionsRef.current.filter((conn) => conn.fromNodeId !== oldOutputId && conn.toNodeId !== oldOutputId);
            }
            // 参考图：分镜帧（两段式）固定为首帧，其余显式选择（含显式清空）优先，未设置时自动带入角色/场景资产设定图
            const usableImageIds = new Set(nodesRef.current.filter((item) => item.type === CanvasNodeType.Image && (item.metadata?.content || item.metadata?.storageKey)).map((item) => item.id));
            const referenceIds = composeScriptBeatVideoReferenceIds(scriptNode.metadata?.scriptBeatFrames?.[beat.id], beat, scriptNode.metadata?.scriptAssets ?? [], scriptNode.metadata?.scriptAssetOutputs ?? {}, (id) => usableImageIds.has(id));
            const type = target === "comfyui" ? CanvasNodeType.ComfyUI : CanvasNodeType.Video;
            const spec = NODE_DEFAULT_SIZE[type];
            const frameColumnWidth = NODE_DEFAULT_SIZE[CanvasNodeType.Image].width + 96;
            const position = { x: scriptNode.position.x + scriptNode.width + 96 + frameColumnWidth, y: scriptNode.position.y + beatIndex * (spec.height + 36) };
            const prompt = resolveScriptBeatVideoPrompt(beat);
            const metadata: CanvasNodeMetadata =
                target === "comfyui"
                    ? { status: NODE_STATUS_IDLE, composerContent: prompt, generationMode: "comfyui", comfyCapability: "text-to-video", comfyWorkflowId: comfyui.defaultWorkflowId }
                    : { status: NODE_STATUS_IDLE, prompt, composerContent: prompt, generationMode: "video", videoGenerationMode: deriveScriptBeatVideoMode(referenceIds.length), model: effectiveConfig.videoModel || effectiveConfig.model };
            const node: CanvasNodeData = {
                ...createCanvasNode(type, { x: position.x + spec.width / 2, y: position.y + spec.height / 2 }, metadata),
                position,
                width: spec.width,
                height: spec.height,
            };
            const newConnections = [createCanvasConnection(scriptNode.id, node.id), ...referenceIds.map((id) => createCanvasConnection(id, node.id))];
            nodesRef.current = [...nodesRef.current, node];
            connectionsRef.current = [...connectionsRef.current, ...newConnections];
            handleConfigNodeChange(scriptNode.id, {
                scriptBeatOutputs: { ...(scriptNode.metadata?.scriptBeatOutputs ?? {}), [beat.id]: node.id },
                scriptOutputIds: [...(scriptNode.metadata?.scriptOutputIds ?? []).filter((id) => id !== oldOutputId), node.id],
            });
            setNodes((prev) => [...prev, node]);
            setConnections((prev) => [...prev, ...newConnections]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            // 不直接生成：回到画布打开 composer，用户在确认卡片里调整提示词、参数和参考方式后才提交
            setScriptStudioNodeId(null);
            setDialogNodeId(node.id);
        },
        [comfyui.defaultWorkflowId, createCanvasConnection, createCanvasNode, deleteNodes, effectiveConfig.model, effectiveConfig.videoModel, handleConfigNodeChange],
    );

    // 两段式第一步：为分镜创建图片节点（分镜帧），确认后才生成；帧节点随后作为视频生成的首帧参考
    const createScriptBeatFrameNode = useCallback(
        (scriptNode: CanvasNodeData, beat: CanvasScriptBeat, beatIndex: number) => {
            const oldFrameId = scriptNode.metadata?.scriptBeatFrames?.[beat.id];
            if (oldFrameId && nodesRef.current.some((node) => node.id === oldFrameId)) {
                deleteNodes(new Set([oldFrameId]));
                connectionsRef.current = connectionsRef.current.filter((conn) => conn.fromNodeId !== oldFrameId && conn.toNodeId !== oldFrameId);
            }
            const usableImageIds = new Set(nodesRef.current.filter((item) => item.type === CanvasNodeType.Image && (item.metadata?.content || item.metadata?.storageKey)).map((item) => item.id));
            const scriptAssets = scriptNode.metadata?.scriptAssets ?? [];
            const referenceIds = resolveScriptBeatReferenceIds(beat, scriptAssets, scriptNode.metadata?.scriptAssetOutputs ?? {}, (id) => usableImageIds.has(id));
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const position = { x: scriptNode.position.x + scriptNode.width + 96, y: scriptNode.position.y + beatIndex * (spec.height + 36) };
            const prompt = resolveScriptBeatImagePrompt(beat, scriptAssets);
            const node: CanvasNodeData = {
                ...createCanvasNode(CanvasNodeType.Image, { x: position.x + spec.width / 2, y: position.y + spec.height / 2 }, { status: NODE_STATUS_IDLE, prompt, composerContent: prompt, generationMode: "image", generationType: "generation", model: effectiveConfig.imageModel || effectiveConfig.model }),
                position,
                width: spec.width,
                height: spec.height,
            };
            const newConnections = [createCanvasConnection(scriptNode.id, node.id), ...referenceIds.map((id) => createCanvasConnection(id, node.id))];
            nodesRef.current = [...nodesRef.current, node];
            connectionsRef.current = [...connectionsRef.current, ...newConnections];
            handleConfigNodeChange(scriptNode.id, {
                scriptBeatFrames: { ...(scriptNode.metadata?.scriptBeatFrames ?? {}), [beat.id]: node.id },
                scriptOutputIds: [...(scriptNode.metadata?.scriptOutputIds ?? []).filter((id) => id !== oldFrameId), node.id],
            });
            setNodes((prev) => [...prev, node]);
            setConnections((prev) => [...prev, ...newConnections]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setScriptStudioNodeId(null);
            setDialogNodeId(node.id);
        },
        [createCanvasConnection, createCanvasNode, deleteNodes, effectiveConfig.imageModel, effectiveConfig.model, handleConfigNodeChange],
    );

    // 拼接导出：把已生成的分镜帧图按宫格拼成一张整图下载
    const stitchScriptBeatFrames = useCallback(
        async (scriptNode: CanvasNodeData) => {
            const beats = scriptNode.metadata?.scriptBeats ?? [];
            const frames = scriptNode.metadata?.scriptBeatFrames ?? {};
            const byId = new Map(nodesRef.current.map((item) => [item.id, item]));
            const images = beats.flatMap((beat, index) => {
                const frameNode = frames[beat.id] ? byId.get(frames[beat.id]) : undefined;
                const url = frameNode?.metadata?.content || "";
                return url ? [{ url, title: beat.title || `分镜 ${index + 1}` }] : [];
            });
            if (!images.length) {
                message.warning("还没有已生成的分镜帧图，请先生成分镜图");
                return;
            }
            try {
                const blob = await stitchImagesToBlob(images);
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = `${scriptNode.metadata?.scriptTitle || scriptNode.title || "分镜"}-分镜图.png`;
                anchor.click();
                URL.revokeObjectURL(url);
                message.success(`已拼接导出 ${images.length} 张分镜图`);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "拼接导出失败");
            }
        },
        [message],
    );

    const createScriptGridStoryboard = useCallback(
        (scriptNode: CanvasNodeData, command: CanvasSlashCommand) => {
            const body = scriptNode.metadata?.scriptBody?.trim() || scriptNode.metadata?.content?.trim() || DEFAULT_SCRIPT_BODY;
            const baseBeats = buildScriptBeats(body);
            const count = command.rows * command.cols;
            const gap = 24;
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const startX = scriptNode.position.x + scriptNode.width + 96;
            const startY = scriptNode.position.y;
            const gridNodes = Array.from({ length: count }, (_, index) => {
                const beat = baseBeats[index % baseBeats.length];
                const col = index % command.cols;
                const row = Math.floor(index / command.cols);
                const position = { x: startX + col * (spec.width + gap), y: startY + row * (spec.height + gap) };
                return {
                    ...createCanvasNode(
                        CanvasNodeType.Image,
                        { x: position.x + spec.width / 2, y: position.y + spec.height / 2 },
                        {
                            status: NODE_STATUS_IDLE,
                            prompt: buildGridBeatPrompt(body, beat, index, count),
                            generationMode: "image",
                            generationType: "generation",
                        },
                    ),
                    position,
                    width: spec.width,
                    height: spec.height,
                } satisfies CanvasNodeData;
            });
            const outputIds = gridNodes.map((node) => node.id);
            nodesRef.current = [...nodesRef.current, ...gridNodes];
            connectionsRef.current = [...connectionsRef.current, ...gridNodes.map((node) => createCanvasConnection(scriptNode.id, node.id))];
            setNodes((prev) => [
                ...prev.map((node) => (node.id === scriptNode.id ? { ...node, metadata: { ...node.metadata, scriptBody: body, content: body, scriptBeats: baseBeats, scriptOutputIds: [...(node.metadata?.scriptOutputIds ?? []), ...outputIds], status: NODE_STATUS_SUCCESS } } : node)),
                ...gridNodes,
            ]);
            setConnections((prev) => [...prev, ...gridNodes.map((node) => createCanvasConnection(scriptNode.id, node.id))]);
            setSelectedNodeIds(new Set(outputIds));
            setSelectedConnectionId(null);
            setDialogNodeId(null);
            message.success(`已生成 ${count} 格${command.label}，可在工作台逐格微调后生成`);
        },
        [createCanvasConnection, createCanvasNode, message],
    );

    const generateScriptAssetNode = useCallback(
        (scriptNode: CanvasNodeData, asset: CanvasScriptAsset, target: "image" | "comfyui" = "image") => {
            const type = target === "comfyui" ? CanvasNodeType.ComfyUI : CanvasNodeType.Image;
            const spec = NODE_DEFAULT_SIZE[type];
            const outputCount = Object.keys(scriptNode.metadata?.scriptAssetOutputs ?? {}).length;
            // 资产设定图是脚本的输入锚点，放在脚本节点左侧列，避免与右侧分镜帧/视频输出重叠
            const position = { x: scriptNode.position.x - spec.width - 96, y: scriptNode.position.y + outputCount * (spec.height + 36) };
            const prompt = buildAssetPrompt(asset);
            const metadata: CanvasNodeMetadata =
                target === "comfyui"
                    ? { status: NODE_STATUS_IDLE, composerContent: prompt, generationMode: "comfyui", comfyCapability: "text-to-image", comfyWorkflowId: comfyui.defaultWorkflowId }
                    : { status: NODE_STATUS_IDLE, prompt, generationMode: "image", generationType: "generation" };
            const node: CanvasNodeData = {
                ...createCanvasNode(type, { x: position.x + spec.width / 2, y: position.y + spec.height / 2 }, metadata),
                position,
                width: spec.width,
                height: spec.height,
            };
            nodesRef.current = [...nodesRef.current, node];
            connectionsRef.current = [...connectionsRef.current, createCanvasConnection(scriptNode.id, node.id)];
            handleConfigNodeChange(scriptNode.id, { scriptAssetOutputs: { ...(scriptNode.metadata?.scriptAssetOutputs ?? {}), [asset.id]: node.id }, scriptOutputIds: [...(scriptNode.metadata?.scriptOutputIds ?? []), node.id] });
            setNodes((prev) => [...prev, node]);
            setConnections((prev) => [...prev, createCanvasConnection(scriptNode.id, node.id)]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(node.id);
        },
        [comfyui.defaultWorkflowId, createCanvasConnection, createCanvasNode, handleConfigNodeChange],
    );

    // 一键补齐：为所有还没有可用设定图的资产创建图片节点（逐个 composer 确认后才生成）
    const generateAllScriptAssetNodes = useCallback(
        (scriptNode: CanvasNodeData) => {
            const assets = scriptNode.metadata?.scriptAssets ?? [];
            const outputs = scriptNode.metadata?.scriptAssetOutputs ?? {};
            const nodeById = new Map(nodesRef.current.map((item) => [item.id, item]));
            const missing = assets.filter((asset) => {
                const out = outputs[asset.id] ? nodeById.get(outputs[asset.id]) : undefined;
                return !(out && out.type === CanvasNodeType.Image && (out.metadata?.content || out.metadata?.storageKey));
            });
            if (!missing.length) {
                message.info("所有资产都已有设定图");
                return;
            }
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const baseCount = Object.keys(outputs).length;
            const newNodes = missing.map((asset, index) => {
                const position = { x: scriptNode.position.x - spec.width - 96, y: scriptNode.position.y + (baseCount + index) * (spec.height + 36) };
                const prompt = buildAssetPrompt(asset);
                return {
                    assetId: asset.id,
                    ...createCanvasNode(CanvasNodeType.Image, { x: position.x + spec.width / 2, y: position.y + spec.height / 2 }, { status: NODE_STATUS_IDLE, prompt, composerContent: prompt, generationMode: "image", generationType: "generation", model: effectiveConfig.imageModel || effectiveConfig.model }),
                    position,
                    width: spec.width,
                    height: spec.height,
                } satisfies CanvasNodeData & { assetId: string };
            });
            const newConnections = newNodes.map((node) => createCanvasConnection(scriptNode.id, node.id));
            nodesRef.current = [...nodesRef.current, ...newNodes];
            connectionsRef.current = [...connectionsRef.current, ...newConnections];
            setNodes((prev) => [...prev, ...newNodes.map(({ assetId: _assetId, ...node }) => node)]);
            setConnections((prev) => [...prev, ...newConnections]);
            handleConfigNodeChange(scriptNode.id, {
                scriptAssetOutputs: { ...outputs, ...Object.fromEntries(newNodes.map((node) => [node.assetId, node.id])) },
                scriptOutputIds: [...(scriptNode.metadata?.scriptOutputIds ?? []), ...newNodes.map((node) => node.id)],
            });
            setSelectedNodeIds(new Set(newNodes.map((node) => node.id)));
            setSelectedConnectionId(null);
            message.success(`已为 ${newNodes.length} 个资产创建设定图节点，在画布上逐个确认后生成`);
        },
        [createCanvasConnection, createCanvasNode, effectiveConfig.imageModel, effectiveConfig.model, handleConfigNodeChange, message],
    );

    // 智能合成：用文本模型为单个分镜同时产出分镜图提示词与结构化视频运动提示词
    const synthesizeScriptBeatPrompts = useCallback(
        async (scriptNode: CanvasNodeData, beat: CanvasScriptBeat) => {
            const requestConfig = { ...effectiveConfig, model: effectiveConfig.textModel || effectiveConfig.model };
            if (!isAiConfigReady(requestConfig, requestConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const hide = message.loading(`正在智能合成「${beat.title}」提示词...`, 0);
            try {
                const messages: AiTextMessage[] = [{ role: "user", content: [{ type: "text", text: buildScriptBeatPromptsSynthPrompt(beat, scriptNode.metadata?.scriptAssets ?? []) }] }];
                const answer = await requestImageQuestion(requestConfig, messages, () => {});
                const { imagePrompt, videoPrompt } = parseScriptBeatPromptsResponse(answer);
                if (!imagePrompt && !videoPrompt) throw new Error("模型没有返回可识别的提示词，请确认当前文本模型可用后重试");
                handleConfigNodeChange(scriptNode.id, {
                    scriptBeats: (scriptNode.metadata?.scriptBeats ?? []).map((item) => (item.id === beat.id ? { ...item, ...(imagePrompt ? { imagePrompt } : {}), ...(videoPrompt ? { videoPrompt } : {}) } : item)),
                });
                message.success("已合成分镜图与视频运动提示词");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "提示词合成失败");
            } finally {
                hide();
            }
        },
        [effectiveConfig, isAiConfigReady, openConfigDialog, message, handleConfigNodeChange],
    );

    const exportScriptBeatNodes = useCallback(
        (scriptNode: CanvasNodeData, target: "video" | "comfyui" | "image", beatIds?: readonly string[]) => {
            // 与工作台分镜表同源：未保存 scriptBeats 时按正文实时解析（含幕/场/镜结构）
            const body = scriptNode.metadata?.scriptBody?.trim() || scriptNode.metadata?.content?.trim() || "";
            const allBeats = scriptNode.metadata?.scriptBeats?.length ? scriptNode.metadata.scriptBeats : buildScriptBeats(body);
            const beats = beatIds?.length ? allBeats.filter((beat) => beatIds.includes(beat.id)) : allBeats;
            if (!allBeats.length) {
                message.warning("分镜表为空，无法导出");
                return;
            }
            if (!beats.length) {
                message.warning("请先勾选要导出的分镜");
                return;
            }
            const isImage = target === "image";
            // 重复导出先替换上次同类批量导出的节点，避免同列叠加；分镜图与视频/ComfyUI 输出分开追踪
            const oldExportIds = new Set(
                (isImage ? Object.values(scriptNode.metadata?.scriptBeatFrames ?? {}) : (scriptNode.metadata?.scriptExportIds ?? [])).filter((id) => nodesRef.current.some((node) => node.id === id)),
            );
            if (oldExportIds.size) {
                deleteNodes(oldExportIds);
                connectionsRef.current = connectionsRef.current.filter((conn) => !oldExportIds.has(conn.fromNodeId) && !oldExportIds.has(conn.toNodeId));
            }
            const type = isImage ? CanvasNodeType.Image : target === "video" ? CanvasNodeType.Video : CanvasNodeType.ComfyUI;
            const spec = NODE_DEFAULT_SIZE[type];
            // 分镜图占脚本右侧第一列，视频/ComfyUI 输出再右移一列
            const frameColumnWidth = NODE_DEFAULT_SIZE[CanvasNodeType.Image].width + 96;
            const startX = scriptNode.position.x + scriptNode.width + 96 + (isImage ? 0 : frameColumnWidth);
            const startY = scriptNode.position.y;
            // 按幕分列：每幕一列，幕内按顺序纵向排列；无幕信息时保持单列
            const actOrder: string[] = [];
            beats.forEach((beat) => {
                const key = beat.act?.trim() || "";
                if (!actOrder.includes(key)) actOrder.push(key);
            });
            const columnByAct = new Map(actOrder.map((key, index) => [key, index]));
            const rowByColumn = new Map<number, number>();
            const usableImageIds = new Set(nodesRef.current.filter((item) => item.type === CanvasNodeType.Image && (item.metadata?.content || item.metadata?.storageKey)).map((item) => item.id));
            const scriptAssets = scriptNode.metadata?.scriptAssets ?? [];
            const scriptAssetOutputs = scriptNode.metadata?.scriptAssetOutputs ?? {};
            const scriptBeatFrames = scriptNode.metadata?.scriptBeatFrames ?? {};
            const exportedNodes = beats.map((beat) => {
                const exportText = isImage ? resolveScriptBeatImagePrompt(beat, scriptAssets) : resolveScriptBeatVideoPrompt(beat);
                const referenceIds = isImage
                    ? resolveScriptBeatReferenceIds(beat, scriptAssets, scriptAssetOutputs, (id) => usableImageIds.has(id))
                    : composeScriptBeatVideoReferenceIds(scriptBeatFrames[beat.id], beat, scriptAssets, scriptAssetOutputs, (id) => usableImageIds.has(id) && !oldExportIds.has(id));
                const column = columnByAct.get(beat.act?.trim() || "") ?? 0;
                const row = rowByColumn.get(column) ?? 0;
                rowByColumn.set(column, row + 1);
                const position = { x: startX + column * (spec.width + 96), y: startY + row * (spec.height + 36) };
                const metadata: CanvasNodeMetadata =
                    target === "video"
                        ? { status: NODE_STATUS_IDLE, prompt: exportText, composerContent: exportText, generationMode: "video", videoGenerationMode: deriveScriptBeatVideoMode(referenceIds.length), model: effectiveConfig.videoModel || effectiveConfig.model }
                        : isImage
                          ? { status: NODE_STATUS_IDLE, prompt: exportText, composerContent: exportText, generationMode: "image", generationType: "generation", model: effectiveConfig.imageModel || effectiveConfig.model }
                          : { status: NODE_STATUS_IDLE, composerContent: exportText, generationMode: "comfyui", comfyCapability: "text-to-video", comfyWorkflowId: comfyui.defaultWorkflowId };
                return {
                    beatId: beat.id,
                    referenceIds,
                    ...createCanvasNode(type, { x: position.x + spec.width / 2, y: position.y + spec.height / 2 }, metadata),
                    position,
                    width: spec.width,
                    height: spec.height,
                } satisfies CanvasNodeData & { beatId: string; referenceIds: string[] };
            });
            const outputIds = exportedNodes.map((node) => node.id);
            const beatOutputs = Object.fromEntries(exportedNodes.map((node) => [node.beatId, node.id]));
            const newNodes = exportedNodes.map(({ beatId: _beatId, referenceIds: _referenceIds, ...node }) => node);
            const newConnections = exportedNodes.flatMap((node) => [createCanvasConnection(scriptNode.id, node.id), ...node.referenceIds.map((id) => createCanvasConnection(id, node.id))]);
            nodesRef.current = [...nodesRef.current, ...newNodes];
            connectionsRef.current = [...connectionsRef.current, ...newConnections];
            setNodes((prev) => [
                ...prev.map((node) =>
                    node.id === scriptNode.id
                        ? {
                              ...node,
                              metadata: {
                                  ...node.metadata,
                                  scriptOutputIds: [...(node.metadata?.scriptOutputIds ?? []).filter((id) => !oldExportIds.has(id)), ...outputIds],
                                  ...(isImage
                                      ? { scriptBeatFrames: beatOutputs }
                                      : {
                                            scriptBeatOutputs: { ...Object.fromEntries(Object.entries(node.metadata?.scriptBeatOutputs ?? {}).filter(([, id]) => !oldExportIds.has(id))), ...beatOutputs },
                                            scriptExportIds: outputIds,
                                        }),
                              },
                          }
                        : node,
                ),
                ...newNodes,
            ]);
            setConnections((prev) => [...prev, ...newConnections]);
            setSelectedNodeIds(new Set(outputIds));
            setSelectedConnectionId(null);
            setDialogNodeId(newNodes[0]?.id ?? null);
            message.success(`已导出 ${newNodes.length} 个分镜为${target === "video" ? "视频" : isImage ? "分镜图" : "ComfyUI"}节点，可在 composer 中继续编辑`);
        },
        [comfyui.defaultWorkflowId, createCanvasConnection, createCanvasNode, deleteNodes, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.videoModel, message],
    );

    const createScriptNarrationNode = useCallback((scriptNode: CanvasNodeData) => {
        const body = scriptNode.metadata?.scriptBody?.trim() || scriptNode.metadata?.content?.trim() || DEFAULT_SCRIPT_BODY;
        const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
        const position = { x: scriptNode.position.x + scriptNode.width + 96, y: scriptNode.position.y + 196 };
        const node: CanvasNodeData = {
            ...createCanvasNode(
                CanvasNodeType.Audio,
                { x: position.x + spec.width / 2, y: position.y + spec.height / 2 },
                { status: NODE_STATUS_IDLE, prompt: `请把下面脚本生成自然、有情绪层次的旁白音频：\n${body}`, generationMode: "audio" },
            ),
            position,
            width: spec.width,
            height: spec.height,
        };
        setNodes((prev) => [...prev.map((item) => (item.id === scriptNode.id ? { ...item, metadata: { ...item.metadata, content: body, scriptBody: body } } : item)), node]);
        setConnections((prev) => [...prev, createCanvasConnection(scriptNode.id, node.id)]);
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
        setDialogNodeId(node.id);
    }, [createCanvasConnection, createCanvasNode]);

    const createScriptVideoNode = useCallback((scriptNode: CanvasNodeData) => {
        const body = scriptNode.metadata?.scriptBody?.trim() || scriptNode.metadata?.content?.trim() || DEFAULT_SCRIPT_BODY;
        const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
        const position = { x: scriptNode.position.x + scriptNode.width + 96, y: scriptNode.position.y + 320 };
        const node: CanvasNodeData = {
            ...createCanvasNode(
                CanvasNodeType.Video,
                { x: position.x + spec.width / 2, y: position.y + spec.height / 2 },
                { status: NODE_STATUS_IDLE, prompt: `请根据下面脚本生成连贯短视频，保留关键情节、角色动作和镜头节奏：\n${body}`, generationMode: "video" },
            ),
            position,
            width: spec.width,
            height: spec.height,
        };
        setNodes((prev) => [...prev.map((item) => (item.id === scriptNode.id ? { ...item, metadata: { ...item.metadata, content: body, scriptBody: body } } : item)), node]);
        setConnections((prev) => [...prev, createCanvasConnection(scriptNode.id, node.id)]);
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
        setDialogNodeId(node.id);
    }, [createCanvasConnection, createCanvasNode]);

    const upstreamScriptText = useCallback((scriptNode: CanvasNodeData): string => {
        const fromIds = connectionsRef.current.filter((conn) => conn.toNodeId === scriptNode.id).map((conn) => conn.fromNodeId);
        return nodesRef.current
            .filter((node) => fromIds.includes(node.id) && node.type === CanvasNodeType.Text && node.metadata?.content?.trim())
            .map((node) => node.metadata?.content?.trim() || "")
            .join("\n\n");
    }, []);

    const analyzeScriptNode = useCallback(
        async (scriptNode: CanvasNodeData) => {
            const requestConfig = { ...effectiveConfig, model: effectiveConfig.textModel || effectiveConfig.model };
            if (!isAiConfigReady(requestConfig, requestConfig.model)) {
                openConfigDialog(true);
                return;
            }
            let body = scriptNode.metadata?.scriptBody?.trim() || scriptNode.metadata?.content?.trim() || "";
            if (!body) body = upstreamScriptText(scriptNode);
            if (!body) {
                message.warning("请输入剧本正文，或先连接上游文本节点");
                return;
            }
            const hide = message.loading("正在用 AI 拆解剧本...", 0);
            try {
                const messages: AiTextMessage[] = [{ role: "user", content: [{ type: "text", text: buildScriptAiPrompt(body) }] }];
                const answer = await requestImageQuestion(requestConfig, messages, () => {});
                const { beats, assets, acts } = parseScriptAiResponse(answer);
                if (!beats.length) throw new Error("模型没有返回可识别的分镜，请确认当前文本模型可用后重试");
                handleConfigNodeChange(scriptNode.id, { scriptBeats: beats, scriptAssets: assets, scriptActs: acts.length ? acts : undefined, status: NODE_STATUS_SUCCESS });
                message.success(`已拆解 ${beats.length} 个分镜${acts.length ? `、${acts.length} 幕` : ""}、${assets.length} 项资产`);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "剧本拆解失败");
            } finally {
                hide();
            }
        },
        [effectiveConfig, isAiConfigReady, openConfigDialog, message, handleConfigNodeChange],
    );

    const handleReparseScriptBody = useCallback(
        (scriptNode: CanvasNodeData) => {
            const body = scriptNode.metadata?.scriptBody?.trim() || scriptNode.metadata?.content?.trim() || "";
            if (!body) {
                message.warning("请先输入剧本正文");
                return;
            }
            const assets = scriptNode.metadata?.scriptAssets ?? [];
            const { beats, acts } = buildScriptBeatsWithActs(body);
            if (!beats.length) {
                message.warning("未从正文识别到分镜编号（如 SH1 / 场 1 / 第一幕）");
                return;
            }
            handleConfigNodeChange(scriptNode.id, {
                scriptBeats: beats.map((beat) => ({ ...beat, prompt: buildScriptBeatPrompt(beat, assets) })),
                scriptActs: acts.length ? acts : undefined,
                status: NODE_STATUS_SUCCESS,
            });
            message.success(`已按正文解析 ${beats.length} 个分镜${acts.length ? `、${acts.length} 幕` : ""}`);
        },
        [handleConfigNodeChange, message],
    );

    const handleImportScriptUpstream = useCallback(
        async (scriptNode: CanvasNodeData) => {
            const upstream = upstreamScriptText(scriptNode);
            if (!upstream) {
                message.warning("请先连接一个文本节点作为剧本输入");
                return;
            }
            const merged = { ...scriptNode, metadata: { ...scriptNode.metadata, scriptBody: upstream, content: upstream } };
            handleConfigNodeChange(scriptNode.id, { scriptBody: upstream, content: upstream, status: NODE_STATUS_SUCCESS });
            await analyzeScriptNode(merged);
        },
        [handleConfigNodeChange, analyzeScriptNode, upstreamScriptText, message],
    );

    const handleScriptBeatChange = useCallback(
        (scriptNode: CanvasNodeData, beat: CanvasScriptBeat) => {
            const assets = scriptNode.metadata?.scriptAssets ?? [];
            handleConfigNodeChange(scriptNode.id, {
                scriptBeats: (scriptNode.metadata?.scriptBeats ?? []).map((item) => (item.id === beat.id ? { ...beat, prompt: buildScriptBeatPrompt(beat, assets) } : item)),
            });
        },
        [handleConfigNodeChange],
    );

    const handleScriptBeatAdd = useCallback(
        (scriptNode: CanvasNodeData, index: number, act?: string) => {
            const next = [...(scriptNode.metadata?.scriptBeats ?? [])];
            next.splice(index + 1, 0, { id: `beat-${Date.now()}`, title: `分镜 ${next.length + 1}`, content: "", prompt: "", ...(act ? { act } : {}) });
            handleConfigNodeChange(scriptNode.id, { scriptBeats: next });
        },
        [handleConfigNodeChange],
    );

    const handleScriptBeatRemove = useCallback(
        (scriptNode: CanvasNodeData, index: number) => {
            const next = [...(scriptNode.metadata?.scriptBeats ?? [])];
            next.splice(index, 1);
            handleConfigNodeChange(scriptNode.id, { scriptBeats: next });
        },
        [handleConfigNodeChange],
    );

    const handleScriptBeatMove = useCallback(
        (scriptNode: CanvasNodeData, index: number, direction: -1 | 1) => {
            const next = [...(scriptNode.metadata?.scriptBeats ?? [])];
            const target = index + direction;
            if (target < 0 || target >= next.length) return;
            [next[index], next[target]] = [next[target], next[index]];
            handleConfigNodeChange(scriptNode.id, { scriptBeats: next });
        },
        [handleConfigNodeChange],
    );

    const handleScriptAssetChange = useCallback(
        (scriptNode: CanvasNodeData, asset: CanvasScriptAsset) => {
            handleConfigNodeChange(scriptNode.id, { scriptAssets: (scriptNode.metadata?.scriptAssets ?? []).map((item) => (item.id === asset.id ? asset : item)) });
        },
        [handleConfigNodeChange],
    );

    const handleScriptAssetAdd = useCallback(
        (scriptNode: CanvasNodeData, asset: CanvasScriptAsset) => {
            handleConfigNodeChange(scriptNode.id, { scriptAssets: [...(scriptNode.metadata?.scriptAssets ?? []), asset] });
        },
        [handleConfigNodeChange],
    );

    const handleScriptAssetRemove = useCallback(
        (scriptNode: CanvasNodeData, assetId: string) => {
            handleConfigNodeChange(scriptNode.id, { scriptAssets: (scriptNode.metadata?.scriptAssets ?? []).filter((item) => item.id !== assetId) });
        },
        [handleConfigNodeChange],
    );

    const renderCanvasNodePanel = useCallback(
        (panelNode: CanvasNodeData) =>
            panelNode.type === CanvasNodeType.Config ? (
                <CanvasConfigComposer
                    value={panelNode.metadata?.composerContent ?? panelNode.metadata?.prompt ?? ""}
                    inputs={configInputsById.get(panelNode.id) || EMPTY_NODE_INPUTS}
                    onChange={(composerContent) => handleConfigNodeChange(panelNode.id, { composerContent })}
                    onClose={() => setDialogNodeId(null)}
                />
            ) : (
                <CanvasNodePromptPanel
                    node={panelNode}
                    isRunning={runningNodeId === panelNode.id}
                    mentionReferences={mentionReferencesByNodeId.get(panelNode.id) || EMPTY_MENTION_REFERENCES}
                    onPromptChange={handleNodePromptChange}
                    onConfigChange={handleConfigNodeChange}
                    onGenerate={handleGenerateNode}
                    onStop={confirmStopGeneration}
                    onRemoveReference={removeNodeReference}
                    onImageSettingsOpenChange={(open) => {
                        setNodeImageSettingsOpen(open);
                        if (open) setToolbarNodeId(null);
                    }}
                    onRetry={(nodeId) => {
                        const retryNode = nodesRef.current.find((item) => item.id === nodeId);
                        if (retryNode) void handleRetryNode(retryNode);
                    }}
                />
            ),
        [
            configInputsById,
            confirmStopGeneration,
            createScriptBeatNode,
            createScriptNarrationNode,
            createScriptStoryboard,
            createScriptVideoNode,
            handleConfigNodeChange,
            handleGenerateNode,
            handleNodePromptChange,
            handleRetryNode,
            mentionReferencesByNodeId,
            removeNodeReference,
            runningNodeId,
            theme,
        ],
    );

    const renderCanvasConfigNodeContent = useCallback(
        (contentNode: CanvasNodeData) => contentNode.type === CanvasNodeType.Config ? (
            <CanvasConfigNodePanel
                node={contentNode}
                isRunning={runningNodeId === contentNode.id}
                inputs={configInputsById.get(contentNode.id) || EMPTY_NODE_INPUTS}
                inputSummary={configInputSummaryById.get(contentNode.id) || EMPTY_INPUT_SUMMARY}
                mentionReferences={mentionReferencesByNodeId.get(contentNode.id) || EMPTY_MENTION_REFERENCES}
                onConfigChange={handleConfigNodeChange}
                onHeightChange={handleConfigNodeHeightChange}
                onComposerToggle={() => setDialogNodeId((current) => (current === contentNode.id ? null : contentNode.id))}
                onStop={confirmStopGeneration}
                onGenerate={(nodeId, comfyWorkflowId) => {
                    const target = nodesRef.current.find((item) => item.id === nodeId);
                    const mode = target?.metadata?.generationMode || defaultGenerationMode(target?.type);
                    void handleGenerateNode(nodeId, mode, target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "", comfyWorkflowId);
                }}
            />
        ) : null,
        [configInputSummaryById, configInputsById, confirmStopGeneration, handleConfigNodeChange, handleConfigNodeHeightChange, handleGenerateNode, mentionReferencesByNodeId, runningNodeId],
    );

    const pendingConnectionCreatePosition = pendingConnectionCreate ? canvasToScreen(pendingConnectionCreate.position) : null;
    const assistantOpen = assistantMounted && !assistantCollapsed;

    const viewportRafRef = useRef<number>(0);
    const pendingViewportRef = useRef<ViewportTransform | null>(null);
    const handleLeaferViewportChange = useCallback((next: ViewportTransform) => {
        viewportRef.current = next;
        pendingViewportRef.current = next;
        if (viewportRafRef.current) return;
        viewportRafRef.current = requestAnimationFrame(() => {
            viewportRafRef.current = 0;
            const pending = pendingViewportRef.current;
            if (!pending) return;
            pendingViewportRef.current = null;
            setViewport((current) => {
                if (current.x === pending.x && current.y === pending.y && current.k === pending.k) return current;
                return pending;
            });
            setContextMenu((current) => (current ? null : current));
        });
    }, []);

    // 组件卸载时取消未执行的 RAF
    useEffect(() => () => {
        if (viewportRafRef.current) cancelAnimationFrame(viewportRafRef.current);
    }, []);

    const selectOnlyNode = useCallback((nodeId: string) => {
        const next = new Set([nodeId]);
        if (setsEqual(selectedNodeIdsRef.current, next)) return;
        selectedNodeIdsRef.current = next;
        setSelectedNodeIds(next);
    }, []);

    const selectSingleNode = useCallback(
        (nodeId: string) => {
            selectOnlyNode(nodeId);
            setSelectedConnectionId(null);
            setContextMenu(null);
            // 脚本/导演台节点单击只选中（可移动），不自动打开面板；双击或点节点内按钮再进入
            const studioNode = nodesRef.current.find((item) => item.id === nodeId);
            const isStudioKind = studioNode?.metadata?.canvasTool === "script" || studioNode?.metadata?.canvasTool === "director";
            if (!isStudioKind) setDialogNodeId(nodeId);
        },
        [selectOnlyNode],
    );

    /** 定位节点：选中 + 视口居中 + 短暂高亮（TapNow：搜索/分组定位后自动定位+高亮）。 */
    const locateNode = useCallback(
        (nodeId: string) => {
            const node = nodeById.get(nodeId);
            if (!node) return;
            selectOnlyNode(nodeId);
            setSelectedConnectionId(null);
            setContextMenu(null);
            const rect = containerRef.current?.getBoundingClientRect();
            const width = rect && rect.width > 0 ? rect.width : size.width;
            const height = rect && rect.height > 0 ? rect.height : size.height;
            const targetK = Math.max(viewportRef.current.k, 0.9);
            const next = centerViewportOnRect(
                { x: node.position.x, y: node.position.y, width: node.width, height: node.height },
                { width, height },
                targetK,
            );
            viewportRef.current = next;
            setViewport(next);
            if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
            setHighlightNodeId(nodeId);
            highlightTimerRef.current = window.setTimeout(() => setHighlightNodeId(null), 1400);
        },
        [nodeById, selectOnlyNode, size.height, size.width],
    );

    /** 节点右侧 + → 弹出 ConnectionCreateMenu（复用建连函数），选择类型后创建下游节点并自动连线。 */
    const handleNodeQuickCreate = useCallback((node: CanvasNodeData) => {
        const position = { x: node.position.x + node.width + 48, y: node.position.y + node.height / 2 };
        setMouseWorld(position);
        setPendingConnectionCreate({ connection: { nodeId: node.id, handleType: "source" }, position });
    }, []);

    const handleRetryNodeAction = useCallback((node: CanvasNodeData) => void handleRetryNode(node), [handleRetryNode]);
    retryNodeRef.current = handleRetryNodeAction;

    /** 整组执行：对打组成员（或与当前节点相连通的整组节点）按连线拓扑序逐层重跑生成节点，同层互不依赖可并发。 */
    const handleExecuteGroup = useCallback(
        async (node: CanvasNodeData) => {
            if (groupExecutionRunningRef.current) {
                message.warning("整组执行进行中，请等待完成");
                return;
            }
            const memberIds = collectGroupMemberIds(nodesRef.current, connectionsRef.current, node.id);
            const plan = buildGroupExecutionPlan(nodesRef.current, connectionsRef.current, memberIds);
            const total = plan.levels.reduce((sum, level) => sum + level.length, 0);
            if (!total) {
                message.warning("组内没有可执行的生成节点");
                return;
            }
            groupExecutionRunningRef.current = true;
            const failed = new Set<string>();
            let succeeded = 0;
            let skipped = 0;
            message.info(`开始整组执行，共 ${total} 个生成节点`);
            try {
                for (const level of plan.levels) {
                    await Promise.all(
                        level.map(async (nodeId) => {
                            const dependencies = plan.dependencies.get(nodeId);
                            if (dependencies && [...dependencies].some((id) => failed.has(id))) {
                                skipped += 1;
                                return;
                            }
                            const target = nodesRef.current.find((item) => item.id === nodeId);
                            if (!target) return;
                            try {
                                await handleRetryNode(target);
                            } catch {
                                failed.add(nodeId);
                                return;
                            }
                            const latest = nodesRef.current.find((item) => item.id === nodeId);
                            if (latest?.metadata?.status === NODE_STATUS_ERROR) failed.add(nodeId);
                            else succeeded += 1;
                        }),
                    );
                }
            } finally {
                groupExecutionRunningRef.current = false;
            }
            if (failed.size) message.warning(`整组执行完成：成功 ${succeeded} 个，失败 ${failed.size} 个${skipped ? `，跳过 ${skipped} 个` : ""}`);
            else message.success(`整组执行完成，共执行 ${succeeded} 个节点${skipped ? `，跳过 ${skipped} 个` : ""}`);
        },
        [handleRetryNode, message],
    );

    // Agent 副作用 op 分发器：所有被引用的 handler 都已定义完毕，赋值给 ref 供 applyAgentOps 使用。
    agentOpsDispatcherRef.current = async (sideEffectOps, configPatchOps) => {
        const toolResults: Record<string, unknown> = {};
        configPatchOps.forEach((op) => {
            if (op.metadata) handleConfigNodeChange(op.id, op.metadata);
        });
        for (const op of sideEffectOps) {
            const nodeById = (id?: string) => (id ? nodesRef.current.find((node) => node.id === id) : undefined);
            switch (op.type) {
                case "run_generation": {
                    const target = nodeById(op.nodeId);
                    const prompt = op.prompt?.trim() ? op.prompt : (target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
                    void generateNodeRef.current?.(op.nodeId, op.mode || target?.metadata?.generationMode || defaultGenerationMode(target?.type), prompt);
                    break;
                }
                case "retry_node": {
                    const target = nodeById(op.id);
                    if (target) void handleRetryNode(target);
                    break;
                }
                case "execute_group": {
                    const target = nodeById(op.id);
                    if (target) void handleExecuteGroup(target);
                    break;
                }
                case "group_nodes": {
                    selectedNodeIdsRef.current = new Set(op.ids);
                    setSelectedNodeIds(new Set(op.ids));
                    createGroupFromSelection(op.variant || "normal");
                    break;
                }
                case "ungroup_nodes":
                    ungroupNodes(op.ids);
                    break;
                case "image_edit": {
                    const target = nodeById(op.id);
                    if (!target) break;
                    if (op.action === "angle") void generateAngleNode(target, { horizontalAngle: 30, pitchAngle: 9, cameraDistance: 4.8, wideAngle: false, ...(op.params || {}) } as CanvasImageAngleParams);
                    else if (op.action === "outpaint") void generateOutpaintNode(target, typeof op.params?.ratioId === "string" ? op.params.ratioId : "16:9");
                    else if (op.action === "lighting") void generateLightingNode(target, (op.params || {}) as CanvasLightingSettings);
                    else if (op.action === "cutout") void generateCutoutNode(target);
                    else if (op.action === "panorama720") void generatePanorama720Node(target);
                    break;
                }
                case "image_quick_command": {
                    const target = nodeById(op.id);
                    const command = CANVAS_IMAGE_QUICK_COMMANDS.find((item) => item.id === op.commandId);
                    if (target && command) void generateImageQuickCommandNode(target, command);
                    break;
                }
                case "image_process": {
                    const target = nodeById(op.id);
                    if (!target) break;
                    if (op.action === "crop" && op.params) void cropImageNode(target, op.params as unknown as CanvasImageCropRect);
                    else if (op.action === "split") void splitImageNode(target, { rows: 2, columns: 2, ...(op.params || {}) } as CanvasImageSplitParams);
                    else if (op.action === "upscale") void upscaleImageNode(target, { targetLongEdge: 2048, algorithm: "high", ...(op.params || {}) } as CanvasImageUpscaleParams);
                    break;
                }
                case "grid_storyboard": {
                    const target = nodeById(op.id);
                    const command = CANVAS_SLASH_COMMANDS.find((item) => item.id === op.commandId);
                    if (target && command) createScriptGridStoryboard(target, command);
                    break;
                }
                case "video_analyze": {
                    const target = nodeById(op.id);
                    if (target) void analyzeVideoNode(target);
                    break;
                }
                case "video_trim": {
                    const target = nodeById(op.id);
                    if (target) void agentTrimVideo(target, op.start, op.end);
                    break;
                }
                case "video_compose": {
                    const target = nodeById(op.id);
                    if (target) void agentComposeVideo(target, op.clips);
                    break;
                }
                case "save_template": {
                    selectedNodeIdsRef.current = new Set(op.ids);
                    setSelectedNodeIds(new Set(op.ids));
                    void saveSelectionAsTemplate(op.name);
                    break;
                }
                case "insert_template": {
                    const template = workflowTemplatesRef.current.find((item) => item.id === op.templateId) || (op.name ? workflowTemplatesRef.current.find((item) => item.name === op.name) : undefined);
                    if (template) insertWorkflowTemplate(template);
                    break;
                }
                case "comfyui_list_workflows": {
                    try {
                        const [workflows, comfyConfig] = await Promise.all([listComfyWorkflows(), Promise.resolve(useConfigStore.getState().comfyui)]);
                        toolResults.comfyuiList = {
                            workflows: workflows.map((workflow) => ({ id: workflow.id, name: workflow.name, title: workflow.title, capability: workflow.capability || "" })),
                            defaultWorkflowId: comfyConfig.defaultWorkflowId || "",
                        };
                    } catch (error) {
                        toolResults.comfyuiList = { workflows: [], defaultWorkflowId: "", error: error instanceof Error ? error.message : "加载工作流失败" };
                    }
                    break;
                }
                case "comfyui_get_workflow": {
                    try {
                        const workflow = await getComfyWorkflow(op.workflowId);
                        toolResults.comfyuiWorkflow = workflow
                            ? { id: workflow.id, name: workflow.name, title: workflow.title, capability: workflow.capability || "", fields: workflow.fields.map((field) => ({ id: field.id, name: field.name, type: field.type, default: field.default ?? null, options: field.options || [], bindPrompt: Boolean(field.bindPrompt) })) }
                            : { error: `工作流不存在：${op.workflowId}` };
                    } catch (error) {
                        toolResults.comfyuiWorkflow = { error: error instanceof Error ? error.message : "读取工作流失败" };
                    }
                    break;
                }
                case "comfyui_set_workflow": {
                    const target = nodeById(op.nodeId);
                    if (!target) {
                        toolResults.comfyuiSet = { error: `节点不存在：${op.nodeId}` };
                        break;
                    }
                    handleConfigNodeChange(op.nodeId, { comfyWorkflowId: op.workflowId, ...(op.values ? { comfyWorkflowValues: op.values } : {}) });
                    toolResults.comfyuiSet = { nodeId: op.nodeId, workflowId: op.workflowId, ok: true };
                    break;
                }
            }
        }
        return toolResults;
    };
    const handleViewNodeImage = useCallback((node: CanvasNodeData) => setPreviewNodeId(node.id), []);
    const insertPanoramaSnapshot = useCallback(
        async (sourceNode: CanvasNodeData, dataUrl: string) => {
            try {
                const image = await uploadImage(dataUrl);
                const nextSize = fitNodeSize(image.width, image.height);
                const position = {
                    x: sourceNode.position.x + sourceNode.width + 80,
                    y: sourceNode.position.y + sourceNode.height / 2 - nextSize.height / 2,
                };
                const node: CanvasNodeData = {
                    ...createCanvasNode(
                        CanvasNodeType.Image,
                        { x: position.x + nextSize.width / 2, y: position.y + nextSize.height / 2 },
                        {
                            ...imageMetadata(image),
                            prompt: "360全景沉浸式预览截图",
                            generationMode: "image",
                            freeResize: true,
                        },
                    ),
                    position,
                    width: nextSize.width,
                    height: nextSize.height,
                };
                setNodes((prev) => [...prev, node]);
                setConnections((prev) => [...prev, createCanvasConnection(sourceNode.id, node.id)]);
                setSelectedNodeIds(new Set([node.id]));
                setSelectedConnectionId(null);
                setDialogNodeId(node.id);
                message.success("截图已插入画布");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "截图插入失败");
            }
        },
        [createCanvasConnection, createCanvasNode, message],
    );
    const openNodeComposer = useCallback(
        (node: CanvasNodeData) => {
            selectOnlyNode(node.id);
            selectedConnectionIdRef.current = null;
            setSelectedConnectionId(null);
            setContextMenu(null);
            if (node.metadata?.canvasTool === "director") {
                setDialogNodeId(null);
                setDirectorStudioNodeId(node.id);
                setEditingNodeId(null);
                return;
            }
            if (node.metadata?.canvasTool === "script") {
                setDialogNodeId(null);
                setScriptStudioNodeId(node.id);
                setEditingNodeId(null);
                return;
            }
            setDialogNodeId(node.id);
            setEditingNodeId(null);
        },
        [selectOnlyNode],
    );

    const handleLeaferNodeTap = useCallback(
        (nodeId: string) => {
            const node = nodeByIdRef.current.get(nodeId);
            const isPopulatedImage =
                node?.type === CanvasNodeType.Image &&
                Boolean(node.metadata?.content || node.metadata?.storageKey);
            if (!node || !isPopulatedImage) return;

            const now = Date.now();
            const previous = imageTapGestureRef.current;
            if (previous.nodeId !== nodeId || now - previous.lastAt > 750) {
                resetImageTapGesture();
                imageTapGestureRef.current = { nodeId, count: 1, lastAt: now, composerTimer: null };
                return;
            }

            const count = previous.count + 1;
            previous.count = count;
            previous.lastAt = now;
            if (count === 2) {
                if (previous.composerTimer) window.clearTimeout(previous.composerTimer);
                previous.composerTimer = window.setTimeout(() => {
                    const currentGesture = imageTapGestureRef.current;
                    if (currentGesture.nodeId !== nodeId || currentGesture.count !== 2) return;
                    const currentNode = nodeByIdRef.current.get(nodeId);
                    resetImageTapGesture();
                    if (currentNode) openNodeComposer(currentNode);
                }, 760);
                return;
            }

            resetImageTapGesture();
            handleViewNodeImage(node);
        },
        [handleViewNodeImage, openNodeComposer, resetImageTapGesture],
    );
    const createConnectedGenerationNode = useCallback(
        (sourceNode: CanvasNodeData, type: CanvasNodeType.Video | CanvasNodeType.Audio) => {
            const source = nodesRef.current.find((node) => node.id === sourceNode.id);
            if (!source) return;
            const spec = NODE_DEFAULT_SIZE[type];
            const prompt = (source.metadata?.content || source.metadata?.prompt || "").trim();
            const target = createCanvasNode(
                type,
                { x: source.position.x + source.width + 96, y: source.position.y },
                type === CanvasNodeType.Video
                    ? {
                          status: NODE_STATUS_IDLE,
                          prompt,
                          composerContent: prompt,
                          generationMode: "video",
                          videoGenerationMode: "text-to-video",
                          model: effectiveConfig.videoModel || effectiveConfig.model,
                      }
                    : {
                          status: NODE_STATUS_IDLE,
                          prompt,
                          composerContent: prompt,
                          generationMode: "audio",
                          model: effectiveConfig.audioModel || effectiveConfig.model,
                      },
            );
            target.width = spec.width;
            target.height = spec.height;
            const nextNodes = [...nodesRef.current, target];
            const nextConnections = [...connectionsRef.current, createCanvasConnection(source.id, target.id)];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set([target.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(target.id);
            setEditingNodeId(null);
        },
        [createCanvasConnection, createCanvasNode, effectiveConfig.audioModel, effectiveConfig.model, effectiveConfig.videoModel],
    );

    const handleNodeAction = useCallback(
        (node: CanvasNodeData, intent: CanvasNodeActionIntent) => {
            switch (intent) {
                case "text-to-video":
                    createConnectedGenerationNode(node, CanvasNodeType.Video);
                    return;
                case "text-to-audio":
                    createConnectedGenerationNode(node, CanvasNodeType.Audio);
                    return;
                case "script-edit":
                    openNodeComposer(node);
                    return;
                case "script-to-storyboard":
                    createScriptStoryboard(node);
                    return;
                case "script-to-video":
                    createScriptVideoNode(node);
                    return;
                case "script-to-audio":
                    createScriptNarrationNode(node);
                    return;
                case "composition-timeline":
                    void openCompositionTimeline(node);
                    return;
                case "image-to-panorama": {
                    const prompt = (node.metadata?.composerContent || node.metadata?.prompt || DEFAULT_PANORAMA_360_PROMPT).trim();
                    const nextNode: CanvasNodeData = {
                        ...node,
                        title: node.title || "360场景",
                        metadata: {
                            ...node.metadata,
                            canvasTool: "panorama360",
                            prompt,
                            composerContent: prompt,
                            generationMode: "image",
                            generationType: "generation",
                            model: node.metadata?.model || effectiveConfig.imageModel || effectiveConfig.model,
                            size: "2048x1024",
                            count: 1,
                            freeResize: true,
                            status: NODE_STATUS_IDLE,
                            errorDetails: undefined,
                        },
                    };
                    setNodes((current) => current.map((item) => (item.id === node.id ? nextNode : item)));
                    openNodeComposer(nextNode);
                    return;
                }
            }
        },
        [createConnectedGenerationNode, createScriptNarrationNode, createScriptStoryboard, createScriptVideoNode, effectiveConfig.imageModel, effectiveConfig.model, openCompositionTimeline, openNodeComposer],
    );
    const visibleConnections = useMemo(
        () =>
            showConnections
                ? connections.filter((connection) => !batchVisibilityIndex.hiddenConnectionEndpointIds.has(connection.fromNodeId) && !batchVisibilityIndex.hiddenConnectionEndpointIds.has(connection.toNodeId))
                : [],
        [batchVisibilityIndex.hiddenConnectionEndpointIds, connections, showConnections],
    );
    const directorStudioNode = useMemo(() => (directorStudioNodeId ? nodes.find((node) => node.id === directorStudioNodeId && node.metadata?.canvasTool === "director") || null : null), [directorStudioNodeId, nodes]);
    const scriptStudioNode = useMemo(() => (scriptStudioNodeId ? nodes.find((node) => node.id === scriptStudioNodeId && node.metadata?.canvasTool === "script") || null : null), [scriptStudioNodeId, nodes]);
    const scriptOutputStates = useMemo(() => {
        const result: Record<string, ScriptOutputState> = {};
        if (scriptStudioNode) {
            const byId = new Map(nodes.map((node) => [node.id, node]));
            const stateOf = (node: CanvasNodeData | undefined): ScriptOutputState => {
                const status = node?.metadata?.status;
                if (status === NODE_STATUS_LOADING) return "loading";
                if (status === NODE_STATUS_ERROR) return "error";
                if (status === NODE_STATUS_SUCCESS && node?.metadata?.content) return "success";
                return "idle";
            };
            for (const [beatId, nodeId] of Object.entries(scriptStudioNode.metadata?.scriptBeatOutputs ?? {})) result[beatId] = stateOf(byId.get(nodeId));
            for (const [beatId, nodeId] of Object.entries(scriptStudioNode.metadata?.scriptBeatFrames ?? {})) result[`${beatId}:frame`] = stateOf(byId.get(nodeId));
            for (const [assetId, nodeId] of Object.entries(scriptStudioNode.metadata?.scriptAssetOutputs ?? {})) result[assetId] = stateOf(byId.get(nodeId));
        }
        return result;
    }, [scriptStudioNode, nodes]);
    const [sessionPricing, setSessionPricing] = useState<CanvasSessionPricing | null>(null);
    useEffect(() => {
        let cancelled = false;
        fetch("/api/auth/session")
            .then((res) => res.json())
            .then((body) => {
                const data = body?.data;
                if (!cancelled && data?.modelPointCosts && data?.generationPointMultipliers) {
                    setSessionPricing({ modelPointCosts: data.modelPointCosts, generationPointMultipliers: data.generationPointMultipliers });
                }
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);
    const scriptPriceEstimates = useMemo(
        () => ({
            image: sessionPricing ? estimateCanvasTaskPoints(sessionPricing, { type: "image", model: effectiveConfig.imageModel || effectiveConfig.model, quality: effectiveConfig.quality }) : null,
            video: sessionPricing ? estimateCanvasTaskPoints(sessionPricing, { type: "video", model: effectiveConfig.videoModel || effectiveConfig.model, quality: effectiveConfig.vquality, seconds: Number(effectiveConfig.videoSeconds) || undefined }) : null,
        }),
        [sessionPricing, effectiveConfig],
    );
    const scriptReferenceOptions = useMemo(
        () =>
            nodes
                .filter((node) => node.type === CanvasNodeType.Image && (node.metadata?.content || node.metadata?.storageKey))
                .map((node) => ({ id: node.id, title: node.title || "图片", url: node.metadata?.content || "" })),
        [nodes],
    );
    const dialogNode = useMemo(() => {
        const node = dialogNodeId ? mountedNodeItems.find((item) => item.id === dialogNodeId) || null : null;
        return node?.metadata?.canvasTool === "director" ? null : node;
    }, [dialogNodeId, mountedNodeItems]);
    const composerShellWidth = canvasShellRef.current?.clientWidth || containerRef.current?.clientWidth || size.width || 1280;
    const composerWidth = dialogNode
        ? Math.min(
              dialogNode.type === CanvasNodeType.ComfyUI ? 1040 : dialogNode.type === CanvasNodeType.Config ? 500 : dialogNode.type === CanvasNodeType.Video ? 1040 : dialogNode.type === CanvasNodeType.Image ? 880 : 760,
              Math.max(dialogNode.type === CanvasNodeType.ComfyUI ? 680 : dialogNode.type === CanvasNodeType.Config ? 420 : dialogNode.type === CanvasNodeType.Video ? 680 : dialogNode.type === CanvasNodeType.Image ? 620 : 520, composerShellWidth - 48),
          )
        : 0;
    dialogNodeRef.current = dialogNode;
    useLayoutEffect(() => {
        const panel = composerPanelRef.current;
        if (!panel || !dialogNode) return;
        let frame = 0;
        const measure = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const nextHeight = Math.max(180, panel.scrollHeight);
                composerHeightRef.current = nextHeight;
                setComposerContentHeight((current) => {
                    // 滞回：忽略 < 6px 的抖动，避免运行状态切换等瞬时内容变化
                    // 触发 maxHeight 微调导致面板内部滚动位置被 clamp（突然滚动）。
                    if (Math.abs(current - nextHeight) < 6) return current;
                    return nextHeight;
                });
            });
        };
        measure();
        // 滚动容器尺寸被 maxHeight 钉住，内容变高时 ResizeObserver 不会触发，
        // 导致面板不跟随内容展开（进入滚动模式）。改用 MutationObserver 观察
        // 面板子树的结构与 class/style 变化（展开输入框、运行条出现等），
        // 触发重测后 maxHeight 跟随更新。measure 内部已有 rAF 节流。
        const observer = new MutationObserver(measure);
        observer.observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [composerWidth, dialogNode?.id]);

    // 运行状态切换瞬间面板内容会变化（按钮/指示器），maxHeight 变化会把
    // 滚动位置 clamp 掉导致"突然滚动"。记录运行前的滚动位置，在高度更新
    // 落定后恢复，保证内容不跳动。
    useEffect(() => {
        const panel = composerPanelRef.current;
        if (panel && dialogNodeId) composerScrollRestoreRef.current = panel.scrollTop;
    }, [runningNodeId, dialogNodeId]);

    useLayoutEffect(() => {
        const panel = composerPanelRef.current;
        if (!panel || composerScrollRestoreRef.current === null) return;
        const restore = composerScrollRestoreRef.current;
        composerScrollRestoreRef.current = null;
        panel.scrollTop = restore;
    }, [composerContentHeight]);
    // 纯数学定位：节点 DOM 位于视口 transform 容器内，坐标可直接由 viewport 换算，
    // 不再每帧 querySelector + getBoundingClientRect（平移/缩放触发的重渲染热点）。
    // 与 handleViewportPresentation 的 60fps 命令式更新保持同一套公式，两路结果一致。
    const composerPosition = useMemo(() => {
        if (!dialogNode) return null;
        const shellRect = canvasShellRef.current?.getBoundingClientRect();
        const containerRect = containerRef.current?.getBoundingClientRect();
        const shellOffsetX = shellRect ? shellRect.left : containerRect?.left || 0;
        const shellOffsetY = shellRect ? shellRect.top : containerRect?.top || 0;
        const containerOffsetX = containerRect ? containerRect.left - shellOffsetX : 0;
        const containerOffsetY = containerRect ? containerRect.top - shellOffsetY : 0;
        const rawLeft = containerOffsetX + (dialogNode.position.x + dialogNode.width / 2) * viewport.k + viewport.x;
        const nodeBottom = containerOffsetY + (dialogNode.position.y + dialogNode.height) * viewport.k + viewport.y;
        return resolveComposerOverlayPosition({
            rawLeft,
            nodeBottom,
            composerHeight: composerContentHeight,
            canvasHeight: shellRect?.height || containerRect?.height || size.height,
        });
    }, [composerContentHeight, dialogNode, size.height, viewport.k, viewport.x, viewport.y]);

    const handleViewportPresentation = useCallback((next: ViewportTransform) => {
        viewportRef.current = next;
        const overlay = composerOverlayRef.current;
        const node = dialogNodeRef.current;
        if (!overlay || !node) return;

        const shellRect = canvasShellRef.current?.getBoundingClientRect();
        const containerRect = containerRef.current?.getBoundingClientRect();
        const shellOffsetX = shellRect ? shellRect.left : containerRect?.left || 0;
        const shellOffsetY = shellRect ? shellRect.top : containerRect?.top || 0;
        const containerOffsetX = containerRect ? containerRect.left - shellOffsetX : 0;
        const containerOffsetY = containerRect ? containerRect.top - shellOffsetY : 0;
        const rawLeft = containerOffsetX + (node.position.x + node.width / 2) * next.k + next.x;
        const nodeBottom = containerOffsetY + (node.position.y + node.height) * next.k + next.y;
        const position = resolveComposerOverlayPosition({
            rawLeft,
            nodeBottom,
            composerHeight: composerHeightRef.current,
            canvasHeight: shellRect?.height || containerRect?.height || size.height,
        });

        overlay.style.left = `${position.left}px`;
        overlay.style.top = `${position.top}px`;
        const panel = composerPanelRef.current;
        if (panel) panel.style.maxHeight = `${position.maxHeight}px`;
    }, [size.height, size.width]);
    if (backendWorkspaceBlocked) return <BackendWorkspaceGate title="画布工作区" />;
    if (canvasSessionExpired) return <CanvasExpiredShell onBack={() => navigate("/canvas")} />;

    return (
        <main
            className="creative-os-shell relative flex h-full min-h-0 overflow-hidden"
            style={
                {
                    background: theme.canvas.background,
                    color: theme.node.text,
                    "--creative-material": theme.ui.material,
                    "--creative-material-elevated": theme.ui.materialElevated,
                    "--creative-hairline": theme.ui.hairline,
                    "--creative-shadow": theme.ui.shadow,
                    "--creative-accent": theme.ui.accent,
                    "--creative-accent-soft": theme.ui.accentSoft,
                    "--creative-control-fill": theme.ui.controlFill,
                    "--creative-danger": theme.ui.danger,
                    "--creative-text": theme.node.text,
                    "--creative-muted": theme.node.muted,
                } as CSSProperties
            }
        >
            <CanvasRestoreCover ready={projectLoaded && canvasVisualReady} />
            <section ref={canvasShellRef} className="creative-os-canvas relative min-w-0 flex-1 overflow-hidden">
                {projectLoaded ? (
                    <>
                <CanvasTopBar
                    title={projectTitle || "未命名画布"}
                    titleDraft={titleDraft}
                    isTitleEditing={titleEditing}
                    onTitleDraftChange={setTitleDraft}
                    onStartTitleEditing={startTitleEditing}
                    onFinishTitleEditing={finishTitleEditing}
                    onCancelTitleEditing={() => setTitleEditing(false)}
                    onHome={() => navigate("/")}
                    onProjects={() => navigate("/canvas")}
                    onCreateProject={createAndOpenProject}
                    onDeleteProject={deleteCurrentProject}
                    agentOpen={assistantOpen}
                    onToggleAgent={() => (assistantOpen ? closeAgent() : openAgent())}
                    saveState={saveState}
                    onRetrySave={() => void retrySave()}
                />

                {showRecoveryNotice ? (
                    <div
                        className="absolute left-1/2 top-3 z-[70] flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-2 text-xs"
                        style={{ background: theme.ui.materialElevated, borderColor: theme.ui.hairline, boxShadow: theme.ui.shadow, color: theme.node.text }}
                    >
                        <span style={{ color: theme.ui.accent }}>已恢复上次未完成编辑的最近保存状态</span>
                        <button
                            type="button"
                            className="grid size-5 shrink-0 place-items-center rounded transition-colors"
                            aria-label="关闭恢复提示"
                            onClick={() => setShowRecoveryNotice(false)}
                            onMouseEnter={(event) => (event.currentTarget.style.background = theme.toolbar.itemHover)}
                            onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
                        >
                            <X className="size-3.5" />
                        </button>
                    </div>
                ) : null}

                <CanvasColorGroupBar nodes={nodes} onLocateNode={locateNode} />
                <CanvasSearchPanel open={searchOpen} nodes={nodes} onClose={() => setSearchOpen(false)} onLocateNode={locateNode} />

                <LeaferCanvas
                    containerRef={containerRef}
                    viewport={viewport}
                    nodes={mountedNodeItems}
                    connections={visibleConnections}
                    backgroundMode={backgroundMode}
                    alignmentGuides={alignmentGuides}
                    selectedNodeIds={selectedNodeIds}
                    selectedConnectionId={selectedConnectionId}
                    onViewportChange={handleLeaferViewportChange}
                    onViewportPresentation={handleViewportPresentation}
                    onNodePointerDown={handleLeaferNodePointerDown}
                    onNodeTap={handleLeaferNodeTap}
                    onNodeDragStart={handleLeaferNodeDragStart}
                    resolveNodeMove={resolveDraggedPosition}
                    onNodesTransform={handleLeaferNodesTransform}
                    onNodesTransformEnd={handleLeaferNodesTransformEnd}
                    onNodeHoverChange={(nodeId) => {
                        if (nodeId) handleNodeHoverStart(nodeId);
                        else handleNodeHoverEnd();
                    }}
                    onNodeContextMenu={(nodeId, clientX, clientY) => {
                        setContextMenu({ type: "node", x: clientX, y: clientY, nodeId });
                    }}
                    onCanvasMouseDown={handleCanvasMouseDown}
                    onCanvasDeselect={deselectCanvas}
                    onContextMenu={(event, canvasPos) => {
                        event.preventDefault();
                        lastCanvasPositionRef.current = canvasPos;
                        setContextMenu({ type: "canvas", x: event.clientX, y: event.clientY, canvasPosition: canvasPos });
                    }}
                    onCanvasDoubleClick={(event, canvasPos) => {
                        lastCanvasPositionRef.current = canvasPos;
                        setContextMenu(null);
                        setCreateMenu({ x: event.clientX, y: event.clientY, canvasPosition: canvasPos });
                    }}
                    onConnectStart={handleLeaferConnectStart}
                    onConnectEnd={handleLeaferConnectEnd}
                    onConnect={handleLeaferConnect}
                    onEdgeClick={selectConnection}
                    onDrop={(files, canvasPos) => {
                        handleDropFiles(files, canvasPos);
                    }}
                    onSelectionBox={(nodeIds, mode) => {
                        const next = mode === 'replace' ? new Set<string>() : new Set(selectedNodeIdsRef.current);
                        for (const nodeId of nodeIds) {
                            if (mode === 'toggle' && next.has(nodeId)) next.delete(nodeId);
                            else next.add(nodeId);
                        }
                        // 内容未变时跳过 setState，避免 Leafer 重复派发选择事件导致的重渲染风暴。
                        if (setsEqual(next, selectedNodeIdsRef.current)) return;
                        resetImageTapGesture();
                        selectedNodeIdsRef.current = next;
                        setSelectedNodeIds(next);
                        setDialogNodeId(null);
                        setContextMenu(null);
                    }}
                    connectingParams={connectingParams}
                    pendingConnection={pendingConnectionCreate}
                    connectionTargetNodeId={connectionTargetNodeId}
                    onConnectionTargetChange={(nodeId) => {
                        connectionTargetNodeIdRef.current = nodeId;
                        setConnectionTargetNodeId(nodeId);
                    }}
                    relatedNodeIds={relatedHighlight.nodeIds}
                    relatedConnectionIds={relatedHighlight.connectionIds}
                    onEdgeContextMenu={openConnectionContextMenu}
                    onReady={() => setCanvasVisualReady(true)}
                >
                    {/* Render node DOM elements */}
                    {mountedNodeItems.map((node) => {
                        const isSelected = selectedNodeIds.has(node.id);
                        return (
                            <CanvasNode
                                key={node.id}
                                onClickCreate={handleNodeQuickCreate}
                                data={node}
                                isSelected={isSelected}
                                isRelated={relatedHighlight.nodeIds.has(node.id)}
                                isFocusRelated={activeNodeId === node.id}
                                isConnectionTarget={connectionTargetNodeId === node.id}
                                connectionTargetSide={connectionTargetNodeId === node.id ? (connectingParams?.handleType === "source" ? "target" : "source") : null}
                                editRequestNonce={editingNodeId === node.id ? editRequestNonce : 0}
                                showPanel={false}
                                batchCount={batchChildCountById.get(node.id) || 0}
                                batchExpanded={Boolean(node.metadata?.imageBatchExpanded)}
                                batchClosing={Boolean(node.metadata?.batchRootId && collapsingBatchIds.has(node.metadata.batchRootId))}
                                batchOpening={openingBatchIds.has(node.id)}
                                batchRecovering={collapsingBatchIds.has(node.id)}
                                batchMotion={batchMotionById.get(node.id)}
                                showImageInfo={showImageInfo}
                                isOverview={isOverviewCanvas}
                                editorManaged
                                resourceLabel={resourceReferenceByNodeId.get(node.id)}
                                mentionReferences={mentionReferencesByNodeId.get(node.id) || EMPTY_MENTION_REFERENCES}
                                inputCount={nodeRelationCounts.get(node.id)?.input || 0}
                                outputCount={nodeRelationCounts.get(node.id)?.output || 0}
                                renderPanel={renderCanvasNodePanel}
                                renderNodeContent={renderCanvasConfigNodeContent}
                                onHoverStart={handleNodeHoverStart}
                                onHoverEnd={handleNodeHoverEnd}
                                onConnectStart={handleLeaferConnectStart}
                                onResize={handleNodeResize}
                                onContentChange={handleNodeContentChange}
                                onTextFormatChange={handleNodeTextFormatChange}
                                onTitleChange={handleNodeTitleChange}
                                onToggleBatch={toggleBatchExpanded}
                                onSetBatchPrimary={setBatchPrimary}
                                onOpenComposer={openNodeComposer}
                                onNodeAction={handleNodeAction}
                                onUpload={(item) => handleUploadRequest(item.id)}
                                onOpenAssetPicker={(item) => openAssetPicker(item.id)}
                                onRetry={handleRetryNodeAction}
                                onCaptureVideoFrame={insertVideoFrameCapture}
                                onViewImage={handleViewNodeImage}
                                onGroupAction={(node, action) => (action === "execute" ? void handleExecuteGroup(node) : handleGroupAction(node, action))}
                                onContextMenu={handleNodeContextMenu}
                            />
                        );
                    })}
                </LeaferCanvas>

                {projectLoaded && canvasVisualReady && nodes.length === 0 ? (
                    <CanvasEmptyState
                        theme={theme}
                        onCreateNode={quickCreateFromEmpty}
                        onOpenTemplates={() => setWorkflowToolboxOpen(true)}
                        onOpenCreateMenu={() => {
                            const rect = containerRef.current?.getBoundingClientRect();
                            const x = (rect?.left || 0) + (rect?.width || size.width) / 2;
                            const y = (rect?.top || 0) + (rect?.height || size.height) / 2;
                            setCreateMenu({ x, y, canvasPosition: screenToCanvas(x, y) });
                        }}
                    />
                ) : null}

                {dialogNode && composerPosition && !isNodeDragging ? (
                    <div
                        ref={composerOverlayRef}
                        data-canvas-no-zoom
                        className="pointer-events-none absolute z-[70]"
                        style={{
                            left: composerPosition.left,
                            top: composerPosition.top,
                            width: composerWidth,
                            transform: "translateX(-50%)",
                        }}
                    >
                        <div
                            ref={composerPanelRef}
                            data-canvas-composer
                            className="creative-os-composer-scroll pointer-events-auto overflow-y-auto"
                            style={{
                                width: composerWidth,
                                maxWidth: "calc(100vw - 48px)",
                                maxHeight: composerPosition.maxHeight,
                            }}
                            onWheel={(event) => {
                                const el = event.currentTarget;
                                if (el.scrollHeight <= el.clientHeight) return;
                                const atTop = el.scrollTop === 0;
                                const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 1;
                                if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) return;
                                event.stopPropagation();
                            }}
                        >
                            <Suspense fallback={LazyComposerFallback}>{renderCanvasNodePanel(dialogNode)}</Suspense>
                        </div>
                    </div>
                ) : null}

                {directorStudioNode ? (
                    <ErrorBoundary
                        fallback={(error, reset) => (
                            <div className="fixed inset-0 z-[220] grid place-items-center bg-black/80 p-6 text-white backdrop-blur-xl">
                                <div className="max-w-md rounded-2xl border border-white/10 bg-neutral-900/90 p-6 text-center shadow-2xl">
                                    <div className="text-base font-medium">导演台加载失败</div>
                                    <div className="mt-2 text-sm text-white/55">{error.message}</div>
                                    <div className="mt-5 flex justify-center gap-2">
                                        <Button onClick={reset}>重试</Button>
                                        <Button type="text" onClick={() => setDirectorStudioNodeId(null)}>关闭</Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    >
                        <Suspense fallback={<div className="fixed inset-0 z-[220] grid place-items-center bg-black text-sm text-white/60">正在打开 3D 导演台...</div>}>
                            <StoryAiDirectorDesk
                                key={directorStudioNode.id}
                                nodeId={directorStudioNode.id}
                                initialProject={directorStudioNode.metadata?.directorProject}
                                theme={colorTheme}
                                onProjectChange={(directorProject) => handleConfigNodeChange(directorStudioNode.id, { directorProject, status: NODE_STATUS_SUCCESS })}
                                onCaptures={(captures) => insertDirectorCaptures(directorStudioNode.id, captures)}
                                onClose={() => setDirectorStudioNodeId(null)}
                            />
                        </Suspense>
                    </ErrorBoundary>
                ) : null}
                {scriptStudioNode ? (
                    <ScriptDeskStudio
                        key={scriptStudioNode.id}
                        node={scriptStudioNode}
                        theme={theme}
                        onClose={() => setScriptStudioNodeId(null)}
                        onChange={(patch) => handleConfigNodeChange(scriptStudioNode.id, patch)}
                        onAiAnalyze={() => void analyzeScriptNode(scriptStudioNode)}
                        onReparse={() => handleReparseScriptBody(scriptStudioNode)}
                        onImportUpstream={() => void handleImportScriptUpstream(scriptStudioNode)}
                        hasUpstreamText={Boolean(upstreamScriptText(scriptStudioNode))}
                        onBeatChange={(beat) => handleScriptBeatChange(scriptStudioNode, beat)}
                        onBeatAdd={(index, act) => handleScriptBeatAdd(scriptStudioNode, index, act)}
                        onBeatRemove={(index) => handleScriptBeatRemove(scriptStudioNode, index)}
                        onBeatMove={(index, direction) => handleScriptBeatMove(scriptStudioNode, index, direction)}
                        onAssetChange={(asset) => handleScriptAssetChange(scriptStudioNode, asset)}
                        onAssetAdd={(asset) => handleScriptAssetAdd(scriptStudioNode, asset)}
                        onAssetRemove={(assetId) => handleScriptAssetRemove(scriptStudioNode, assetId)}
                        onGenerateBeat={(beat, index, target) => (target === "image" ? createScriptBeatFrameNode(scriptStudioNode, beat, index) : createScriptBeatNode(scriptStudioNode, beat, index, target))}
                        onGenerateAsset={(asset, target) => generateScriptAssetNode(scriptStudioNode, asset, target)}
                        onGenerateAllAssets={() => generateAllScriptAssetNodes(scriptStudioNode)}
                        onSynthesizeBeat={(beat) => synthesizeScriptBeatPrompts(scriptStudioNode, beat)}
                        onExportBeats={(target, beatIds) => exportScriptBeatNodes(scriptStudioNode, target, beatIds)}
                        onStitchFrames={() => void stitchScriptBeatFrames(scriptStudioNode)}
                        priceEstimates={scriptPriceEstimates}
                        outputStates={scriptOutputStates}
                        referenceOptions={scriptReferenceOptions}
                    />
                ) : null}

                <CanvasAssetManagerPanel
                    open={canvasAssetPanelOpen}
                    initialTab={canvasAssetPanelInitialTab}
                    nodes={nodes}
                    selectedNodeIds={selectedNodeIds}
                    onClose={() => setCanvasAssetPanelOpen(false)}
                    onSelectNode={selectSingleNode}
                    onOpenAssetPicker={() => openAssetPicker()}
                    onUpload={() => handleUploadRequest()}
                />

                {pendingConnectionCreate && pendingConnectionCreatePosition ? (
                    <ConnectionCreateMenu pending={pendingConnectionCreate} position={pendingConnectionCreatePosition} onCreate={(type) => createConnectedNode(type, pendingConnectionCreate)} onClose={cancelPendingConnectionCreate} />
                ) : null}

                {!isNodeDragging && !nodeImageSettingsOpen && viewport.k >= 0.3 && toolbarNode && !selectedNodeOwnsToolbar ? (
                    <CanvasNodeHoverToolbar
                        node={toolbarNode}
                        viewport={viewport}
                        onKeep={keepNodeToolbar}
                        onLeave={hideNodeToolbar}
                        onInfo={(node) => setInfoNodeId(node.id)}
                        onEditText={openTextEditor}
                        onDecreaseFont={(node) => handleFontSizeChange(node.id, Math.max(10, (node.metadata?.fontSize || 14) - 2))}
                        onIncreaseFont={(node) => handleFontSizeChange(node.id, Math.min(32, (node.metadata?.fontSize || 14) + 2))}
                        onToggleDialog={(node) => setDialogNodeId((current) => (current === node.id ? null : node.id))}
                        onUpload={(node) => handleUploadRequest(node.id)}
                        onMarkPanorama360={(node) => markNodeAsPanorama360(node.id)}
                        onDownload={downloadNodeImage}
                        onSaveAsset={(node) => void saveNodeAsset(node)}
                        onMaskEdit={(node) => void openImageToolDialog(node, setMaskEditNodeId)}
                        onCrop={(node) => void openImageToolDialog(node, setCropNodeId)}
                        onSplit={(node) => void openImageToolDialog(node, setSplitNodeId)}
                        onUpscale={(node) => void openImageToolDialog(node, setUpscaleNodeId)}
                        onAngle={(node) => void openImageToolDialog(node, setAngleNodeId)}
                        onOutpaint={(node) => void openImageToolDialog(node, setOutpaintNodeId)}
                        onLighting={(node) => void openImageToolDialog(node, setLightingNodeId)}
                        onCutout={(node) => void generateCutoutNode(node)}
                        onPanorama720={(node) => void generatePanorama720Node(node)}
                        onViewImage={handleViewNodeImage}
                        onReversePrompt={createImageReversePromptNodes}
                        onAnalyzeVideo={(node) => void analyzeVideoNode(node)}
                        onTrimVideo={(node) => void openVideoTrim(node)}
                        onRetry={handleRetryNodeAction}
                        onExecuteGroup={(node) => void handleExecuteGroup(node)}
                        onToggleFreeResize={(node) => toggleNodeFreeResize(node.id)}
                        onQuickStoryboard={(node, command) => createScriptGridStoryboard(node, command)}
                        onQuickImageCommand={(node, command) => void generateImageQuickCommandNode(node, command)}
                        onDelete={(node) => deleteNodes(new Set([node.id]))}
                    />
                ) : null}

                <CanvasToolbar
                    selectedCount={selectedNodeIds.size}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    backgroundMode={backgroundMode}
                    snapToGrid={snapToGrid}
                    alignmentGuidesEnabled={alignmentGuidesEnabled}
                    showImageInfo={showImageInfo}
                    showConnections={showConnections}
                    onCreateAction={(action) => handleCreateMenuAction(action)}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    onUpload={() => handleUploadRequest()}
                    onGroup={() => createGroupFromSelection('normal')}
                    onStoryboardGroup={() => createGroupFromSelection('storyboard')}
                    onDelete={deleteSelectedNodes}
                    onClear={() => setClearConfirmOpen(true)}
                    onDeselect={deselectCanvas}
                    onBackgroundModeChange={setBackgroundMode}
                    onSnapToGridChange={setSnapToGrid}
                    onAlignmentGuidesEnabledChange={handleAlignmentGuidesEnabledChange}
                    onShowImageInfoChange={setShowImageInfo}
                    onShowConnectionsChange={setShowConnections}
                    assetPanelOpen={canvasAssetPanelOpen}
                    onOpenMyAssets={() => {
                        setCanvasAssetPanelInitialTab("assets");
                        setCanvasAssetPanelOpen(true);
                    }}
                    onOpenMaterialLibrary={openMaterialLibrary}
                    onOpenWorkflowToolbox={() => setWorkflowToolboxOpen(true)}
                />

                <CanvasZoomControls
                    scale={viewport.k}
                    onScaleChange={setZoomScale}
                    onReset={resetViewport}
                    isMiniMapOpen={isMiniMapOpen}
                    onToggleMiniMap={() => setIsMiniMapOpen((value) => !value)}
                    onOpenMyAssets={() => {
                        setCanvasAssetPanelInitialTab("canvas");
                        setCanvasAssetPanelOpen(true);
                        setDialogNodeId(null);
                    }}
                />

                {!assistantOpen ? <button
                    type="button"
                    className="creative-os-agent-fab group absolute bottom-6 right-6 z-50 flex size-12 items-center justify-center rounded-full border"
                    style={{
                        background: theme.ui.materialElevated,
                        borderColor: theme.ui.hairline,
                        color: theme.toolbar.item,
                        boxShadow: theme.ui.shadow,
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                        event.stopPropagation();
                        openAgent();
                    }}
                    aria-label="打开创作 Agent"
                    aria-expanded={false}
                >
                    <span className="canvas-agent-fab-tooltip pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-medium" style={{ background: theme.ui.materialElevated, borderColor: theme.ui.hairline, color: theme.node.text }}>
                        打开 Agent
                    </span>
                    <Bot className="canvas-agent-fab-icon size-5" />
                </button> : null}

                {isMiniMapOpen ? (
                    <CanvasMiniMap
                        nodes={nodes}
                        selectedNodeIds={selectedNodeIds}
                        viewport={viewport}
                        containerSize={size}
                        onNavigate={(next) => {
                            viewportRef.current = next;
                            setViewport(next);
                        }}
                    />
                ) : null}

                {contextMenu?.type === "canvas" ? (
                    <CanvasCreateNodeMenu
                        position={{ x: contextMenu.x, y: contextMenu.y }}
                        onClose={() => setContextMenu(null)}
                        onAction={(action) => {
                            handleCreateMenuAction(action, contextMenu.canvasPosition);
                            setContextMenu(null);
                        }}
                    />
                ) : null}

                {createMenu ? (
                    <CanvasCreateNodeMenu
                        position={createMenu}
                        onClose={() => setCreateMenu(null)}
                        onAction={(action) => {
                            handleCreateMenuAction(action, createMenu.canvasPosition);
                            setCreateMenu(null);
                        }}
                    />
                ) : null}

                {contextMenu && contextMenu.type !== "canvas" ? (
                    <CanvasNodeContextMenu
                        menu={contextMenu}
                        onClose={() => setContextMenu(null)}
                        onDuplicate={() => {
                            if (contextMenu.type !== "node") return;
                            duplicateNode(contextMenu.nodeId);
                            setContextMenu(null);
                        }}
                        onDelete={() => {
                            if (contextMenu.type === "node") {
                                deleteNodes(new Set([contextMenu.nodeId]));
                            } else if (contextMenu.type === "connection") {
                                deleteConnection(contextMenu.connectionId);
                            }
                            setContextMenu(null);
                        }}
                    />
                ) : null}

                <input ref={imageInputRef} type="file" accept="image/*,video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav,text/plain,text/markdown,.txt,.md,.markdown,.srt" className="hidden" onChange={handleImageInputChange} />

                {infoNode ? <CanvasNodeInfoModal node={infoNode} open={Boolean(infoNode)} onClose={() => setInfoNodeId(null)} /> : null}

                {cropNode && imageToolDialogUrl ? <CanvasNodeCropDialog dataUrl={imageToolDialogUrl} open={Boolean(cropNode)} onClose={() => setCropNodeId(null)} onConfirm={(crop) => void cropImageNode(cropNode!, crop)} /> : null}

                {maskEditNode && imageToolDialogUrl ? (
                    <CanvasNodeMaskEditDialog dataUrl={imageToolDialogUrl} open={Boolean(maskEditNode)} onClose={() => setMaskEditNodeId(null)} onConfirm={(payload) => void maskEditImageNode(maskEditNode!, payload)} />
                ) : null}

                {splitNode && imageToolDialogUrl ? <CanvasNodeSplitDialog dataUrl={imageToolDialogUrl} open={Boolean(splitNode)} onClose={() => setSplitNodeId(null)} onConfirm={(params) => void splitImageNode(splitNode!, params)} /> : null}

                {upscaleNode && imageToolDialogUrl ? (
                    <CanvasNodeUpscaleDialog dataUrl={imageToolDialogUrl} open={Boolean(upscaleNode)} onClose={() => setUpscaleNodeId(null)} onConfirm={(params) => void upscaleImageNode(upscaleNode!, params)} />
                ) : null}
{angleNode && imageToolDialogUrl ? <CanvasNodeAngleDialog dataUrl={imageToolDialogUrl} open={Boolean(angleNode)} onClose={() => setAngleNodeId(null)} onConfirm={(params) => void generateAngleNode(angleNode!, params)} /> : null}

                {outpaintNode && imageToolDialogUrl ? <CanvasNodeOutpaintDialog dataUrl={imageToolDialogUrl} open={Boolean(outpaintNode)} onClose={() => setOutpaintNodeId(null)} onConfirm={(ratioId) => void generateOutpaintNode(outpaintNode!, ratioId)} /> : null}

                {lightingNode && imageToolDialogUrl ? <CanvasNodeLightingDialog dataUrl={imageToolDialogUrl} open={Boolean(lightingNode)} onClose={() => setLightingNodeId(null)} onConfirm={(settings) => void generateLightingNode(lightingNode!, settings)} /> : null}

                {trimVideoNode && trimVideoSrc ? (
                    <CanvasVideoTrimDialog
                        src={trimVideoSrc}
                        open={Boolean(trimVideoNode)}
                        onClose={() => {
                            setTrimVideoNodeId(null);
                            setTrimVideoSrc("");
                        }}
                        onConfirm={(range) => void confirmVideoTrim(range)}
                    />
                ) : null}

                {compositionNode?.metadata?.canvasTool === "videoComposition" ? (
                    <CanvasVideoCompositionDialog open={Boolean(compositionNode)} sources={compositionSources} onClose={() => setCompositionNodeId(null)} onExport={(videoClips, audioClips) => void handleCompositionExport(videoClips, audioClips)} />
                ) : null}

                <Modal
                    className={previewNode?.metadata?.canvasTool === 'panorama360' ? 'canvas-panorama-modal' : undefined}
                    title={previewNode?.metadata?.canvasTool === "panorama360" ? "360全景预览" : "图片详情"}
                    open={Boolean(previewNode && (previewNode.metadata?.content || previewNode.metadata?.storageKey))}
                    centered
                    onCancel={() => setPreviewNodeId(null)}
                    footer={null}
                    transitionName={previewNode?.metadata?.canvasTool === 'panorama360' ? '' : undefined}
                    maskTransitionName={previewNode?.metadata?.canvasTool === 'panorama360' ? '' : undefined}
                    width={previewNode?.metadata?.canvasTool === "panorama360" ? "96vw" : "auto"}
                    styles={{ body: { padding: 0, display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "80vh" } }}
                >
                    {previewNode && (previewNode.metadata?.content || previewNode.metadata?.storageKey) ? (
                        <PreviewImageContent node={previewNode} onCapturePanorama={(dataUrl) => insertPanoramaSnapshot(previewNode, dataUrl)} />
                    ) : null}
                </Modal>

                <Modal
                    title="清空画布？"
                    open={clearConfirmOpen}
                    centered
                    onCancel={() => setClearConfirmOpen(false)}
                    footer={
                        <>
                            <Button onClick={() => setClearConfirmOpen(false)}>取消</Button>
                            <Button danger type="primary" onClick={clearCanvas}>
                                清空
                            </Button>
                        </>
                    }
                >
                    <p className="text-sm opacity-60">这会删除当前画布上的所有节点和连线。</p>
                </Modal>

                {assetPickerOpen ? <AssetPickerModal open={assetPickerOpen} onInsert={handleAssetInsert} onClose={() => { setAssetPickerOpen(false); setAssetPickerTargetNodeId(null); }} /> : null}
                <CanvasMaterialLibraryModal
                    open={materialLibraryOpen}
                    initialTab={materialLibraryTab}
                    onClose={() => setMaterialLibraryOpen(false)}
                    onUsePreset={insertMaterialPreset}
                    onOpenAssetPicker={() => {
                        setMaterialLibraryOpen(false);
                        openAssetPicker();
                    }}
                    onUpload={() => {
                        setMaterialLibraryOpen(false);
                        handleUploadRequest();
                    }}
                />
                <CanvasWorkflowToolbox
                    open={workflowToolboxOpen}
                    templates={workflowTemplates}
                    loading={workflowTemplatesLoading}
                    selectedCount={selectedNodeIds.size}
                    onClose={() => setWorkflowToolboxOpen(false)}
                    onSaveSelection={saveSelectionAsTemplate}
                    onInsert={insertWorkflowTemplate}
                    onDelete={deleteWorkflowTemplate}
                />
                <CanvasGenerationHistoryModal open={generationHistoryOpen} nodes={nodes} onClose={() => setGenerationHistoryOpen(false)} onSelectNode={duplicateNode} />
                    </>
                ) : null}
            </section>
            {projectLoaded && assistantMounted ? (
                <CanvasAssistantPanel
                    nodes={nodes}
                    selectedNodeIds={selectedNodeIds}
                    snapshot={agentSnapshot}
                    sessions={chatSessions}
                    activeSessionId={activeChatId}
                    onSelectNodeIds={setSelectedNodeIds}
                    onSessionsChange={handleAssistantSessionsChange}
                    onApplyOps={applyAgentOps}
                    canUndoOps={agentUndoStack.length > 0}
                    onUndoOps={undoAgentOps}
                    onPasteImage={pasteAssistantImage}
                    agentMode={agentMode}
                    onAgentModeChange={setAgentMode}
                    workflowTemplates={workflowTemplates}
                    closing={assistantClosing}
                    onCollapse={closeAgent}
                />
            ) : null}
        </main>
    );
}

function stopCanvasPanelInteraction(event: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>) {
    event.stopPropagation();
}

function CanvasPanelInput({ label, value, placeholder, onChange, style }: { label: string; value: string; placeholder: string; onChange: (value: string) => void; style: CSSProperties }) {
    return (
        <label className="nodrag nopan block min-w-0" onMouseDownCapture={stopCanvasPanelInteraction} onPointerDownCapture={stopCanvasPanelInteraction} onClickCapture={(event) => event.stopPropagation()}>
            <span className="mb-1 block text-xs opacity-55">{label}</span>
            <input className="nodrag nopan h-9 w-full rounded-lg border px-3 text-sm outline-none placeholder:opacity-35 select-text" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} style={style} />
        </label>
    );
}

function materialPresetBackground(index: number, tab: "styles" | "effects" | "assets") {
    const styles = ["linear-gradient(135deg,#111827,#0e7490,#f8fafc)", "linear-gradient(135deg,#1f2937,#f59e0b,#fef3c7)", "linear-gradient(135deg,#0a0a0a,#581c87,#22d3ee)"];
    const effects = [
        "radial-gradient(circle at 35% 35%,#f8fafc 0 8%,transparent 9%),linear-gradient(135deg,#111827,#1d4ed8)",
        "conic-gradient(from 120deg,#111827,#16a34a,#f8fafc,#111827)",
        "linear-gradient(120deg,#0f172a 0 35%,#f97316 36% 44%,#111827 45% 100%)",
    ];
    return (tab === "effects" ? effects : styles)[index % 3];
}

function CanvasMaterialLibraryModal({
    open,
    initialTab,
    onClose,
    onUsePreset,
    onOpenAssetPicker,
    onUpload,
}: {
    open: boolean;
    initialTab: "styles" | "effects" | "assets";
    onClose: () => void;
    onUsePreset: (preset: { title: string; prompt: string }) => void;
    onOpenAssetPicker: () => void;
    onUpload: () => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const [tab, setTab] = useState<"styles" | "effects" | "assets">("styles");

    useEffect(() => {
        if (open) setTab(initialTab);
    }, [initialTab, open]);

    const presets = tab === "effects" ? MATERIAL_LIBRARY_PRESETS.effects : MATERIAL_LIBRARY_PRESETS.styles;
    return (
        <Modal title="素材库" open={open} centered width={720} footer={null} onCancel={onClose} destroyOnHidden styles={{ body: { background: theme.node.panel, color: theme.node.text } }}>
            <div className="mb-4 flex gap-1 rounded-lg p-1" style={{ background: theme.toolbar.itemHover }}>
                {[
                    ["styles", "风格库"],
                    ["effects", "效果库"],
                    ["assets", "我的素材"],
                ].map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        className="h-8 rounded-md px-3 text-sm transition"
                        style={{ background: tab === value ? theme.toolbar.activeBg : "transparent", color: tab === value ? theme.toolbar.activeText : theme.node.text }}
                        onClick={() => setTab(value as "styles" | "effects" | "assets")}
                    >
                        {label}
                    </button>
                ))}
            </div>
            {tab === "assets" ? (
                <div className="grid min-h-[260px] place-items-center rounded-xl border p-8 text-center" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                    <div>
                        <FolderOpen className="mx-auto mb-3 size-8 opacity-55" />
                        <div className="text-sm font-medium">从我的素材插入</div>
                        <div className="mt-2 text-xs opacity-55">支持文本、图片、视频和音频素材回写到当前画布</div>
                        <div className="mt-4 flex justify-center gap-2">
                            <Button onClick={onUpload} icon={<Upload className="size-4" />}>
                                上传
                            </Button>
                            <Button type="primary" onClick={onOpenAssetPicker} icon={<FolderOpen className="size-4" />}>
                                选择素材
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-3">
                    {presets.map((preset, index) => (
                        <button
                            key={preset.title}
                            type="button"
                            className="group min-w-0 rounded-xl border p-3 text-left transition hover:bg-white/10"
                            style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}
                            onClick={() => onUsePreset(preset)}
                        >
                            <div className="mb-3 aspect-square rounded-lg" style={{ background: materialPresetBackground(index, tab) }} />
                            <div className="truncate text-sm font-medium">{preset.title}</div>
                            <div className="mt-1 line-clamp-2 text-xs leading-5 opacity-55">{preset.prompt}</div>
                            <div className="mt-3 text-xs opacity-0 transition group-hover:opacity-80">插入到画布</div>
                        </button>
                    ))}
                </div>
            )}
        </Modal>
    );
}

function CanvasGenerationHistoryModal({ open, nodes, onClose, onSelectNode }: { open: boolean; nodes: CanvasNodeData[]; onClose: () => void; onSelectNode: (nodeId: string) => void }) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const [tab, setTab] = useState<"image" | "video" | "audio">("image");
    const items = nodes.filter((node) => {
        const hasMedia = Boolean(node.metadata?.content || node.metadata?.storageKey);
        if (!hasMedia) return false;
        if (tab === "image") return node.type === CanvasNodeType.Image;
        if (tab === "video") return node.type === CanvasNodeType.Video;
        return node.type === CanvasNodeType.Audio;
    });
    const sourceLabels = ["FlowCanvas", "生成节点", "ComfyUI", "AI应用"];

    return (
        <Modal title="选择生成历史" open={open} centered width={760} footer={null} onCancel={onClose} styles={{ body: { background: theme.node.panel, color: theme.node.text } }}>
            <div className="grid min-h-[360px] grid-cols-[132px_1fr] gap-4">
                <div className="space-y-2 border-r pr-3" style={{ borderColor: theme.toolbar.border }}>
                    {sourceLabels.map((label) => (
                        <div key={label} className="rounded-lg px-3 py-2 text-sm" style={{ background: label === "FlowCanvas" ? theme.toolbar.activeBg : "transparent", color: label === "FlowCanvas" ? theme.toolbar.activeText : theme.node.text }}>
                            {label}
                        </div>
                    ))}
                </div>
                <div className="min-w-0">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex gap-1 rounded-lg p-1" style={{ background: theme.toolbar.itemHover }}>
                            {[
                                ["image", "图片"],
                                ["video", "视频"],
                                ["audio", "音频"],
                            ].map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    className="h-8 rounded-md px-3 text-sm transition"
                                    style={{ background: tab === value ? theme.toolbar.activeBg : "transparent", color: tab === value ? theme.toolbar.activeText : theme.node.text }}
                                    onClick={() => setTab(value as "image" | "video" | "audio")}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <span className="text-xs opacity-55">已选 0/10 项</span>
                    </div>
                    {items.length ? (
                        <div className="grid grid-cols-3 gap-3">
                            {items.slice(0, 30).map((node) => (
                                <button
                                    key={node.id}
                                    type="button"
                                    className="group min-w-0 rounded-xl border p-2 text-left transition hover:bg-white/10"
                                    style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}
                                    onClick={() => {
                                        onSelectNode(node.id);
                                        onClose();
                                    }}
                                >
                                    <div className="mb-2 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg text-xs opacity-90" style={{ background: theme.toolbar.itemHover }}>
                                        {tab === "image" ? <HistoryImageThumb node={node} /> : tab === "video" ? <HistoryVideoThumb node={node} /> : <Music2 className="size-6 opacity-65" />}
                                    </div>
                                    <div className="truncate text-sm font-medium">{node.title}</div>
                                    <div className="mt-1 truncate text-xs opacity-50">{node.metadata?.prompt || node.metadata?.requestPrompt || "画布生成结果"}</div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="grid min-h-[260px] place-items-center rounded-xl border text-center text-sm opacity-55" style={{ borderColor: theme.toolbar.border }}>
                            当前画布还没有可选择的{tab === "image" ? "图片" : tab === "video" ? "视频" : "音频"}生成结果
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}

/** 生成历史图片缩略图：按 storageKey 重新签名解析（content 里的旧签名 URL 可能已过期）。 */
function HistoryImageThumb({ node }: { node: CanvasNodeData }) {
    const [url, setUrl] = useState("");
    useEffect(() => {
        let cancelled = false;
        const { storageKey, content } = node.metadata ?? {};
        if (storageKey) {
            void resolveImageUrl(storageKey, "").then((resolved) => {
                if (!cancelled && resolved) setUrl(resolved);
            });
        } else if (content) {
            setUrl(content);
        }
        return () => {
            cancelled = true;
        };
    }, [node.metadata?.storageKey, node.metadata?.content]);
    return url ? <img src={url} alt="" className="size-full object-cover" draggable={false} /> : <ImageIcon className="size-6 opacity-65" />;
}

/** 生成历史视频缩略图：取视频首帧（poster 由浏览器加载首帧前无法直接取，这里按 storageKey 重新签名后展示第一帧）。 */
function HistoryVideoThumb({ node }: { node: CanvasNodeData }) {
    const [url, setUrl] = useState("");
    useEffect(() => {
        let cancelled = false;
        const { storageKey, content } = node.metadata ?? {};
        const resolve = (resolved: string) => {
            if (!cancelled && resolved) setUrl(resolved);
        };
        if (storageKey) void resolveMediaUrl(storageKey, "").then(resolve);
        else if (content) setUrl(content);
        return () => {
            cancelled = true;
        };
    }, [node.metadata?.storageKey, node.metadata?.content]);
    return url ? <video src={url} className="size-full object-cover" muted playsInline preload="metadata" /> : <Video className="size-6 opacity-65" />;
}

function CanvasAssetManagerPanel({
    open,
    initialTab,
    nodes,
    selectedNodeIds,
    onClose,
    onSelectNode,
    onOpenAssetPicker,
    onUpload,
}: {
    open: boolean;
    initialTab: "canvas" | "assets";
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    onClose: () => void;
    onSelectNode: (nodeId: string) => void;
    onOpenAssetPicker: () => void;
    onUpload: () => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const assets = useAssetStore((state) => state.assets);
    const [tab, setTab] = useState<"canvas" | "assets">("canvas");
    const [query, setQuery] = useState("");
    const filteredNodes = nodes.filter((node) => `${node.title} ${node.type}`.toLowerCase().includes(query.trim().toLowerCase()));
    const filteredAssets = assets.filter((asset) => `${asset.title} ${(asset.tags || []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));

    useEffect(() => {
        if (open) setTab(initialTab);
    }, [initialTab, open]);

    if (!open) return null;

    return (
        <aside className="absolute bottom-0 left-0 top-0 z-[65] flex w-[280px] flex-col border-r backdrop-blur-xl" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
            <div className="flex h-[92px] shrink-0 flex-col justify-end border-b px-4 pb-3" style={{ borderColor: theme.toolbar.border }}>
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">资产管理</div>
                        <div className="mt-1 truncate text-xs opacity-55">当前画布资源与项目素材</div>
                    </div>
                    <button type="button" className="grid size-8 place-items-center rounded-lg transition hover:bg-white/10" onClick={onClose} aria-label="关闭资产管理">
                        <X className="size-4" />
                    </button>
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 border-b p-2" style={{ borderColor: theme.toolbar.border }}>
                <button
                    type="button"
                    className="h-8 rounded-lg px-3 text-sm font-medium transition"
                    style={{ background: tab === "canvas" ? theme.toolbar.activeBg : "transparent", color: tab === "canvas" ? theme.toolbar.activeText : theme.node.text }}
                    onClick={() => setTab("canvas")}
                >
                    画布
                </button>
                <button
                    type="button"
                    className="h-8 rounded-lg px-3 text-sm font-medium transition"
                    style={{ background: tab === "assets" ? theme.toolbar.activeBg : "transparent", color: tab === "assets" ? theme.toolbar.activeText : theme.node.text }}
                    onClick={() => setTab("assets")}
                >
                    资产
                </button>
            </div>
            <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2" style={{ borderColor: theme.toolbar.border }}>
                <Search className="size-4 opacity-45" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === "canvas" ? "搜索画布元素" : "搜索素材"} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:opacity-45" />
            </div>
            {tab === "canvas" ? (
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
                    <div className="mb-2 flex items-center justify-between text-xs opacity-55">
                        <span>画布元素</span>
                        <span>共 {nodes.length} 节点</span>
                    </div>
                    <div className="space-y-1.5">
                        {filteredNodes.map((node) => (
                            <button
                                key={node.id}
                                type="button"
                                className="flex h-10 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-sm transition"
                                style={{ background: selectedNodeIds.has(node.id) ? theme.toolbar.activeBg : "transparent", color: selectedNodeIds.has(node.id) ? theme.toolbar.activeText : theme.node.text }}
                                onClick={() => onSelectNode(node.id)}
                            >
                                <span className="grid size-7 shrink-0 place-items-center rounded-md" style={{ background: theme.toolbar.itemHover }}>
                                    {nodeIcon(node.type)}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{node.title || node.type}</span>
                            </button>
                        ))}
                        {!filteredNodes.length ? <div className="rounded-lg px-2 py-8 text-center text-sm opacity-50">没有匹配的画布元素</div> : null}
                    </div>
                </div>
            ) : (
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
                    <div className="mb-3 grid grid-cols-2 gap-2">
                        <Button className="!h-9" icon={<FolderOpen className="size-4" />} onClick={onOpenAssetPicker}>
                            从素材插入
                        </Button>
                        <Button className="!h-9" icon={<Upload className="size-4" />} onClick={onUpload}>
                            上传
                        </Button>
                    </div>
                    <div className="mb-2 flex items-center justify-between text-xs opacity-55">
                        <span>我的素材</span>
                        <span>共 {assets.length} 项</span>
                    </div>
                    <div className="space-y-1.5">
                        {filteredAssets.slice(0, 40).map((asset) => (
                            <button key={asset.id} type="button" className="flex h-10 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-sm transition hover:bg-white/10" onClick={onOpenAssetPicker}>
                                <span className="grid size-7 shrink-0 place-items-center rounded-md" style={{ background: theme.toolbar.itemHover }}>
                                    {asset.kind === "text" ? <FileText className="size-4" /> : <ImageIcon className="size-4" />}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{asset.title}</span>
                            </button>
                        ))}
                        {!filteredAssets.length ? <div className="rounded-lg px-2 py-8 text-center text-sm opacity-50">还没有素材，先上传或保存节点到素材库</div> : null}
                    </div>
                </div>
            )}
        </aside>
    );
}

function nodeIcon(type: CanvasNodeType) {
    if (type === CanvasNodeType.Text) return <FileText className="size-4" />;
    if (type === CanvasNodeType.Image) return <ImageIcon className="size-4" />;
    if (type === CanvasNodeType.Video) return <Video className="size-4" />;
    if (type === CanvasNodeType.Audio) return <Music2 className="size-4" />;
    if (type === CanvasNodeType.Group) return <Layers3 className="size-4" />;
    return <Box className="size-4" />;
}

type CanvasEmptyStateProps = {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onCreateNode: (type: CanvasNodeType, metadata?: CanvasNodeMetadata) => void;
    onOpenTemplates: () => void;
    onOpenCreateMenu: () => void;
};

function CanvasEmptyState({ theme, onCreateNode, onOpenTemplates, onOpenCreateMenu }: CanvasEmptyStateProps) {
    const actions: Array<{ id: string; label: string; description: string; icon: ReactNode; type?: CanvasNodeType; metadata?: CanvasNodeMetadata; onClick?: () => void }> = [
        { id: "text-to-video", label: "文字生视频", description: "从一句话开始创作镜头", icon: <Video className="size-4.5" />, type: CanvasNodeType.Video, metadata: { generationMode: "video", videoGenerationMode: "text-to-video" } },
        { id: "image-background", label: "图片换背景", description: "保留主体，快速换场景", icon: <ImageIcon className="size-4.5" />, type: CanvasNodeType.Image, metadata: { generationMode: "image", generationType: "edit", prompt: "保留主体，替换背景环境" } },
        { id: "first-last-frame", label: "首帧生成视频", description: "从关键画面延展动作", icon: <Clapperboard className="size-4.5" />, type: CanvasNodeType.Video, metadata: { generationMode: "video", videoGenerationMode: "first-last-frame" } },
        { id: "audio-to-video", label: "音频生视频", description: "用声音作为创作上下文", icon: <Music2 className="size-4.5" />, type: CanvasNodeType.Video, metadata: { generationMode: "video", videoGenerationMode: "all-in-one-reference" } },
        { id: "text", label: "文本", description: "记录脚本、台词或灵感", icon: <FileText className="size-4.5" />, type: CanvasNodeType.Text },
        { id: "audio", label: "音频", description: "配音、音乐与音效", icon: <Music2 className="size-4.5" />, type: CanvasNodeType.Audio },
        { id: "template", label: "模板", description: "复用一套完整工作流", icon: <Workflow className="size-4.5" />, onClick: onOpenTemplates },
    ];

    const quickActions = [actions[0], actions[1], actions[2], actions[3], actions[6]];

    return (
        <div className="pointer-events-none absolute inset-0 z-[40] flex items-center justify-center px-4 py-20">
            <div className="canvas-empty-state pointer-events-auto flex w-[min(900px,calc(100vw-32px))] flex-col items-center text-center">
                <div className="canvas-empty-guidance flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[15px] leading-7" style={{ color: theme.node.muted }}>
                    <button type="button" className="canvas-empty-double-click inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-semibold" style={{ color: theme.node.text, background: theme.ui.materialElevated, borderColor: theme.ui.hairline }} onClick={onOpenCreateMenu}>
                        <Sparkles className="size-3.5" style={{ color: theme.ui.accent }} />
                        双击画布
                    </button>
                    <span>自由创作，或浏览模板。</span>
                </div>
                <div className="canvas-empty-actions mt-3 flex max-w-full flex-wrap justify-center gap-2">
                    {quickActions.map((action, index) => (
                        <button
                            key={action.id}
                            type="button"
                            data-canvas-quick-action={action.id}
                            className="canvas-empty-action-card canvas-empty-action-pill group inline-flex h-9 items-center gap-2 rounded-full border px-3 text-left text-[12px] font-medium"
                            style={{ background: theme.ui.materialElevated, borderColor: theme.ui.hairline, color: theme.node.text, animationDelay: `${80 + index * 45}ms` }}
                            onClick={() => (action.onClick ? action.onClick() : action.type ? onCreateNode(action.type, action.metadata) : undefined)}
                        >
                            <span className="canvas-empty-action-icon grid size-4 shrink-0 place-items-center" style={{ color: theme.node.muted }}>
                                {action.icon}
                            </span>
                            <span>{action.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function CanvasTopBar({
    title,
    titleDraft,
    isTitleEditing,
    onTitleDraftChange,
    onStartTitleEditing,
    onFinishTitleEditing,
    onCancelTitleEditing,
    onHome,
    onProjects,
    onCreateProject,
    onDeleteProject,
    agentOpen,
    onToggleAgent,
    saveState,
    onRetrySave,
}: {
    title: string;
    titleDraft: string;
    isTitleEditing: boolean;
    onTitleDraftChange: (value: string) => void;
    onStartTitleEditing: () => void;
    onFinishTitleEditing: () => void;
    onCancelTitleEditing: () => void;
    onHome: () => void;
    onProjects: () => void;
    onCreateProject: () => void;
    onDeleteProject: () => void;
    agentOpen: boolean;
    onToggleAgent: () => void;
    saveState: CanvasSaveState;
    onRetrySave: () => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const titleRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isTitleEditing) return;
        const close = (event: PointerEvent) => {
            if (!titleRef.current?.contains(event.target as Node)) onFinishTitleEditing();
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [isTitleEditing, onFinishTitleEditing]);

    return (
        <div className="creative-os-topbar pointer-events-none absolute inset-x-0 top-0 z-50 flex h-16 items-center justify-between px-3 sm:px-4">
            <div className="pointer-events-auto flex items-center gap-2">
                <Dropdown
                    trigger={["click"]}
                    menu={{
                        items: [
                            { key: "home", icon: <Home className="size-4" />, label: "回到主页", onClick: onHome },
                            { key: "projects", icon: <Images className="size-4" />, label: "全部项目", onClick: onProjects },
                            { type: "divider" },
                            { key: "new", icon: <Plus className="size-4" />, label: "创建新项目", onClick: onCreateProject },
                            { type: "divider" },
                            { key: "delete", danger: true, icon: <Trash2 className="size-4" />, label: "删除项目", onClick: onDeleteProject },
                        ],
                    }}
                >
                    <button type="button" className="creative-os-icon-button" aria-label="打开画布菜单">
                        <Menu className="size-[18px]" />
                    </button>
                </Dropdown>
                <span className="hidden text-[13px] font-semibold tracking-normal opacity-70 sm:block">FlowCanvas</span>
                <SaveStateIndicator state={saveState} mutedColor={theme.node.muted} accentColor={theme.ui.accent} dangerColor={theme.ui.danger} onRetry={onRetrySave} />
            </div>

            <div ref={titleRef} className="pointer-events-auto absolute left-1/2 max-w-[44vw] -translate-x-1/2">
                {isTitleEditing ? (
                    <input
                        autoFocus
                        value={titleDraft}
                        onChange={(event) => onTitleDraftChange(event.target.value)}
                        onBlur={onFinishTitleEditing}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") onFinishTitleEditing();
                            if (event.key === "Escape") onCancelTitleEditing();
                        }}
                        className="creative-os-title-control w-[min(280px,44vw)] bg-transparent px-3 text-center text-[13px] font-semibold outline-none"
                        style={{ color: theme.node.text }}
                    />
                ) : (
                    <button type="button" className="creative-os-title-control max-w-[44vw] truncate px-3 text-[13px] font-semibold" onDoubleClick={onStartTitleEditing} title="双击修改画布名称">
                        {title}
                    </button>
                )}
            </div>

            <div className="pointer-events-auto flex items-center gap-1.5">
                <Dropdown
                    trigger={["click"]}
                    menu={{
                        items: [
                            {
                                key: "publish",
                                icon: <Upload className="size-4" />,
                                label: (
                                    <div>
                                        <div className="font-medium">发布作品</div>
                                        <div className="text-xs opacity-55">发布当前作品和创作过程</div>
                                    </div>
                                ),
                            },
                            {
                                key: "link",
                                icon: <Link2 className="size-4" />,
                                label: (
                                    <div>
                                        <div className="font-medium">分享链接</div>
                                        <div className="text-xs opacity-55">复制当前画布地址</div>
                                    </div>
                                ),
                                onClick: () => void navigator.clipboard?.writeText(window.location.href),
                            },
                        ],
                    }}
                >
                    <button type="button" className="creative-os-icon-button" aria-label="发布与分享">
                        <Share2 className="size-[17px]" />
                    </button>
                </Dropdown>
                <Button
                    type="text"
                    className={`creative-os-agent-button ${agentOpen ? "is-active" : ""}`}
                    icon={<Bot className="size-[17px]" />}
                    onClick={onToggleAgent}
                    aria-label="打开创作 Agent"
                >
                    <span className="hidden sm:inline">Agent</span>
                </Button>
            </div>
        </div>
    );
}

/** 顶栏保存状态：常驻小指示，失败/离线可点击重试（不打断式提示）。 */
function SaveStateIndicator({ state, mutedColor, accentColor, dangerColor, onRetry }: { state: CanvasSaveState; mutedColor: string; accentColor: string; dangerColor: string; onRetry: () => void }) {
    if (state === "saving") {
        return (
            <span className="ml-1.5 hidden items-center gap-1 text-[11px] sm:flex" style={{ color: mutedColor }}>
                <LoaderCircle className="size-3 animate-spin" style={{ color: accentColor }} />
                保存中…
            </span>
        );
    }
    if (state === "error" || state === "offline") {
        return (
            <button
                type="button"
                className="ml-1.5 hidden items-center gap-1 rounded px-1 text-[11px] transition hover:opacity-100 sm:flex"
                style={{ color: dangerColor, opacity: 0.85 }}
                onClick={onRetry}
                title="点击重试保存"
            >
                <CloudOff className="size-3" />
                {state === "offline" ? "离线，点击重试" : "保存失败，点击重试"}
            </button>
        );
    }
    return (
        <span className="ml-1.5 hidden items-center gap-1 text-[11px] opacity-50 sm:flex" style={{ color: mutedColor }}>
            <Check className="size-3" style={{ color: accentColor }} />
            已保存
        </span>
    );
}

function imageExtension(dataUrl: string) {
    return dataUrl.match(/^data:image[/]([^;]+)/)?.[1] || dataUrl.match(/image[/]([^;]+)/)?.[1] || "png";
}

function audioExtension(mimeType?: string) {
    if (mimeType?.includes("wav")) return "wav";
    if (mimeType?.includes("opus")) return "opus";
    if (mimeType?.includes("aac")) return "aac";
    if (mimeType?.includes("flac")) return "flac";
    if (mimeType?.includes("pcm")) return "pcm";
    return "mp3";
}

function imageMetadata(image: UploadedImage): CanvasNodeMetadata {
    return { content: image.url, storageKey: image.storageKey, status: "success", naturalWidth: image.width, naturalHeight: image.height, bytes: image.bytes, mimeType: image.mimeType };
}

function videoMetadata(video: UploadedFile): CanvasNodeMetadata {
    return { content: video.url, storageKey: video.storageKey, status: "success", naturalWidth: video.width, naturalHeight: video.height, bytes: video.bytes, mimeType: video.mimeType || "video/mp4", durationMs: video.durationMs };
}

function audioMetadata(audio: UploadedFile): CanvasNodeMetadata {
    return { content: audio.url, storageKey: audio.storageKey, status: "success", bytes: audio.bytes, mimeType: audio.mimeType || "audio/mpeg", durationMs: audio.durationMs };
}

function promoteImageMetadata(current: CanvasNodeMetadata | undefined, source: CanvasNodeMetadata | undefined): CanvasNodeMetadata {
    const next: CanvasNodeMetadata = { ...current };
    if (!source) return next;
    next.content = source.content;
    next.storageKey = source.storageKey;
    next.naturalWidth = source.naturalWidth;
    next.naturalHeight = source.naturalHeight;
    next.freeResize = source.freeResize;
    next.bytes = source.bytes;
    next.mimeType = source.mimeType;
    next.status = source.status || next.status;
    next.errorDetails = source.errorDetails;
    return next;
}

function buildImageGenerationMetadata(type: CanvasImageGenerationType, config: AiConfig, count: number, references: ReferenceImage[]): CanvasNodeMetadata {
    return {
        generationType: type,
        model: config.model,
        size: config.size,
        quality: config.quality,
        resolution: config.resolution,
        count,
        references: references.map(referenceUrl).filter((url): url is string => Boolean(url)),
    };
}

function buildComfyCanvasFieldValues(workflow: ComfyWorkflow, nodeValues: Record<string, unknown>, prompt: string) {
    const values = Object.fromEntries(workflow.fields.map((field) => [field.id, nodeValues[field.id] ?? field.default]));
    const promptText = prompt.trim();
    if (!promptText) return values;
    workflow.fields
        .filter((field) => (field.bindPrompt || isComfyPromptField(field)) && nodeValues[field.id] === undefined)
        .forEach((field) => {
            values[field.id] = promptText;
        });
    return values;
}

function isComfyPromptField(field: ComfyWorkflowField) {
    if (field.type !== "text" && field.type !== "textarea") return false;
    return /prompt|text|caption|description|positive|negative|提示词|正向|负向/i.test(`${field.input} ${field.name}`);
}

const NODE_REF_PATTERN = /@\[node:([^\]]+)\]/;
const NODE_REF_PATTERN_GLOBAL = /@\[node:([^\]]+)\]/g;

function resolveComfyTextFields(workflow: ComfyWorkflow, values: Record<string, unknown>, context: NodeGenerationContext) {
    workflow.fields
        .filter((field) => field.type === "text" || field.type === "textarea")
        .forEach((field) => {
            values[field.id] = replaceComfyReferences(String(values[field.id] ?? ""), context, "text");
        });
}

async function resolveComfyMediaFields(workflow: ComfyWorkflow, values: Record<string, unknown>, context: NodeGenerationContext, config: ComfyUiConfig, signal?: AbortSignal) {
    const mediaFields = workflow.fields.filter((field): field is ComfyWorkflowField & { type: "image" | "video" | "audio" } => field.type === "image" || field.type === "video" || field.type === "audio");
    for (const field of mediaFields) {
        const raw = String(values[field.id] ?? "");
        const media = findMediaByReference(field.type, raw, context);
        if (!media) {
            if (raw.match(NODE_REF_PATTERN)) throw new Error(`字段「${field.name || field.input}」引用的上游节点不存在或类型不匹配`);
            continue;
        }
        const { blob, filename } = await fetchMediaBlob(media);
        const uploaded = await uploadComfyFile(config, blob, filename, signal);
        values[field.id] = uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;
    }
}

async function runComfyMaskEdit(
    workflow: ComfyWorkflow,
    source: ReferenceImage,
    maskDataUrl: string,
    prompt: string,
    config: ComfyUiConfig,
    signal?: AbortSignal,
    jobId?: string,
    beforeQueue?: () => Promise<void>,
) {
    const imageFields = workflow.fields.filter((field) => field.type === "image");
    if (!imageFields.length) throw new Error("该 ComfyUI 工作流没有暴露图片输入");

    const maskFields = imageFields.filter((field) => isComfyMaskField(workflow, field));
    const sourceFields = imageFields.filter((field) => !maskFields.includes(field));
    if (maskFields.length && !sourceFields.length) throw new Error("工作流只暴露了蒙版输入，还需要暴露原图图片输入");

    const values = buildComfyCanvasFieldValues(workflow, {}, prompt);
    if (maskFields.length) {
        const [sourceUpload, maskUpload] = await Promise.all([
            uploadComfyImageSource(config, source.dataUrl || source.storageKey || source.url || "", source.name, signal),
            uploadComfyImageSource(config, maskDataUrl, "flowcanvas-mask.png", signal),
        ]);
        sourceFields.forEach((field) => {
            values[field.id] = comfyUploadPath(sourceUpload);
        });
        maskFields.forEach((field) => {
            values[field.id] = comfyUploadPath(maskUpload);
        });
    } else {
        const maskedSource = await buildComfyMaskedSource(source.dataUrl || source.storageKey || source.url || "", maskDataUrl);
        const upload = await uploadComfyImageSource(config, maskedSource, "flowcanvas-inpaint.png", signal);
        imageFields.forEach((field) => {
            values[field.id] = comfyUploadPath(upload);
        });
    }

    const requestWorkflow = applyComfyWorkflowFields(workflow.workflow, workflow.fields, values);
    await beforeQueue?.();
    const result = await runComfyWorkflow(config, requestWorkflow, signal, jobId);
    if (!result.images.length) throw new Error("ComfyUI 消除工作流没有返回图片");
    return { dataUrl: result.images[0] };
}

function isComfyMaskField(workflow: ComfyWorkflow, field: ComfyWorkflowField) {
    const node = workflow.workflow[field.node];
    return /mask|蒙版|遮罩/i.test(`${field.input} ${field.name} ${node?._meta?.title || ""} ${node?.class_type || ""}`);
}

async function uploadComfyImageSource(config: ComfyUiConfig, source: string, filename: string, signal?: AbortSignal) {
    if (!source) throw new Error("无法读取局部编辑图片");
    // CSP connect-src 不允许 data: URL 作为 fetch 目标，data URL 直接解码为 Blob
    const blob = source.startsWith("data:") ? dataUrlToBlob(source) : await (await fetch(source, { signal })).blob();
    return uploadComfyFile(config, blob, filename, signal);
}

function comfyUploadPath(upload: { name: string; subfolder?: string }) {
    return upload.subfolder ? `${upload.subfolder}/${upload.name}` : upload.name;
}

async function buildComfyMaskedSource(sourceUrl: string, maskDataUrl: string) {
    const [sourceBlob, maskBlob] = await Promise.all([
        sourceUrl.startsWith("data:") ? Promise.resolve(dataUrlToBlob(sourceUrl)) : fetch(sourceUrl).then((response) => (response.ok ? response.blob() : Promise.reject(new Error(`读取原图失败：HTTP ${response.status}`)))),
        // CSP connect-src 不允许 data: URL 作为 fetch 目标，data URL 直接解码为 Blob
        maskDataUrl.startsWith("data:") ? Promise.resolve(dataUrlToBlob(maskDataUrl)) : fetch(maskDataUrl).then((response) => (response.ok ? response.blob() : Promise.reject(new Error(`读取蒙版失败：HTTP ${response.status}`)))),
    ]);
    const [sourceBitmap, maskBitmap] = await Promise.all([createImageBitmap(sourceBlob), createImageBitmap(maskBlob)]);
    try {
        const canvas = document.createElement("canvas");
        canvas.width = sourceBitmap.width;
        canvas.height = sourceBitmap.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("浏览器无法创建蒙版画布");
        context.drawImage(sourceBitmap, 0, 0);
        const sourcePixels = context.getImageData(0, 0, canvas.width, canvas.height);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(maskBitmap, 0, 0, canvas.width, canvas.height);
        const maskPixels = context.getImageData(0, 0, canvas.width, canvas.height);
        for (let index = 3; index < sourcePixels.data.length; index += 4) {
            sourcePixels.data[index] = maskPixels.data[index];
        }
        context.putImageData(sourcePixels, 0, 0);
        return canvas.toDataURL("image/png");
    } finally {
        sourceBitmap.close();
        maskBitmap.close();
    }
}

function replaceComfyReferences(value: string, context: NodeGenerationContext, type: "text" | "image" | "video" | "audio") {
    let next = value.replace(NODE_REF_PATTERN_GLOBAL, (_, nodeId: string) => {
        const text = findTextByNodeId(nodeId, context);
        return text ?? "";
    });
    getLabeledInputs(context, type).forEach((input) => {
        if (input.type !== "text") return;
        next = replaceStandaloneLabel(next, input.label, input.text || "");
    });
    return next;
}

function findMediaByReference(type: "image" | "video" | "audio", raw: string, context: NodeGenerationContext) {
    const match = raw.match(NODE_REF_PATTERN);
    if (match) return findMediaByNodeId(type, match[1], context);
    const value = raw.trim();
    const reference = getLabeledInputs(context, type).find((input) => value === input.label || value === `【${input.label}】`);
    if (!reference) return null;
    return findMediaByNodeId(type, reference.nodeId, context);
}

function findMediaByNodeId(type: "image" | "video" | "audio", nodeId: string, context: NodeGenerationContext) {
    const input = context.inputs.find((item) => item.nodeId === nodeId && item.type === type);
    if (type === "image") return input?.image || null;
    if (type === "video") return input?.video || null;
    if (type === "audio") return input?.audio || null;
    return null;
}

function findTextByNodeId(nodeId: string, context: NodeGenerationContext) {
    return getLabeledInputs(context, "text").find((input) => input.nodeId === nodeId)?.text;
}

function getLabeledInputs(context: NodeGenerationContext, type: "text" | "image" | "video" | "audio") {
    const items = type === "text" ? context.inputs.filter((input) => input.type === "text") : context.inputs.filter((input) => input.type === type);
    return items.map((item, index) => ({ ...item, label: comfyReferenceLabel(type, index) }));
}

function comfyReferenceLabel(type: "text" | "image" | "video" | "audio", index: number) {
    if (type === "image") return `图片${index + 1}`;
    if (type === "video") return `视频${index + 1}`;
    if (type === "audio") return `音频${index + 1}`;
    return `文本${index + 1}`;
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceStandaloneLabel(value: string, label: string, replacement: string) {
    const escaped = escapeRegExp(label);
    return value.replace(new RegExp(`【${escaped}】`, "g"), replacement).replace(new RegExp(`(^|[^\\p{L}\\p{N}_【])${escaped}(?![\\p{L}\\p{N}_】])`, "gu"), (_match, prefix: string) => `${prefix}${replacement}`);
}

async function fetchMediaBlob(media: { dataUrl?: string; url?: string; storageKey?: string; name?: string; type?: string }) {
    const source = media.dataUrl || media.url || "";
    if (!source && !media.storageKey) throw new Error("无法读取媒体数据");
    let blob: Blob;
    if (source.startsWith("data:")) {
        // CSP connect-src 不允许 data: URL 作为 fetch 目标，data URL 直接解码为 Blob
        blob = dataUrlToBlob(source);
    } else {
        // 优先按存储键读取（backend: 同源签名地址 / 浏览器本地媒体库）
        const stored = media.storageKey ? await readStoredMediaBlob(media.storageKey, media.type).catch(() => null) : null;
        if (stored) {
            blob = stored;
        } else {
            const url = toFetchableMediaUrl(source, media.storageKey, window.location.origin);
            if (!url) throw new Error("媒体引用已失效，请重新上传或重新生成");
            const response = await fetch(url);
            if (!response.ok) throw new Error(`读取参考媒体失败：HTTP ${response.status}`);
            blob = await response.blob();
        }
    }
    const ext = blob.type.split("/")[1]?.split(";")[0] || "bin";
    const filename = `${media.name || `upload-${Date.now()}`}.${ext}`;
    return { blob, filename };
}

async function readStoredMediaBlob(storageKey: string, mimeType?: string) {
    if (mimeType?.startsWith("video/") || mimeType?.startsWith("audio/")) return getMediaBlob(storageKey);
    if (mimeType?.startsWith("image/")) return getImageBlob(storageKey);
    return (await getImageBlob(storageKey)) || getMediaBlob(storageKey);
}

function buildAudioGenerationMetadata(config: AiConfig): CanvasNodeMetadata {
    return {
        model: config.model,
        audioVoice: config.audioVoice,
        audioFormat: config.audioFormat,
        audioSpeed: config.audioSpeed,
        audioInstructions: config.audioInstructions,
    };
}

function referenceUrl(image: ReferenceImage) {
    return image.storageKey || image.url || (!image.dataUrl.startsWith("data:") ? image.dataUrl : undefined);
}

function generationReferenceUrls(context: { referenceImages: ReferenceImage[]; referenceVideos: Array<{ storageKey?: string; url?: string }>; referenceAudios?: Array<{ storageKey?: string; url?: string }> }) {
    return [
        ...context.referenceImages.map(referenceUrl).filter((url): url is string => Boolean(url)),
        ...context.referenceVideos.map((video) => video.storageKey || video.url).filter((url): url is string => Boolean(url)),
        ...(context.referenceAudios || []).map((audio) => audio.storageKey || audio.url).filter((url): url is string => Boolean(url)),
    ];
}

async function resolveMetadataReferences(metadata: CanvasNodeMetadata) {
    if (metadata.generationType !== "edit") return [];
    if (!metadata.references?.length) return null;
    const references = await Promise.all(
        metadata.references.map(async (url, index) => {
            const dataUrl = url.startsWith("image:") ? await resolveImageUrl(url, "") : url;
            return dataUrl ? { id: `${index}`, name: `reference-${index}.png`, type: "image/png", dataUrl, storageKey: url.startsWith("image:") ? url : undefined } : null;
        }),
    );
    return references.every(Boolean) ? (references as ReferenceImage[]) : null;
}

/** 探测媒体时长（秒），失败返回 0。供 Agent 合成/剪辑构造时间轴片段使用。 */
function probeMediaDuration(src: string, kind: "video" | "audio") {
    return new Promise<number>((resolve) => {
        const element = document.createElement(kind);
        element.preload = "metadata";
        element.onloadedmetadata = () => resolve(Number.isFinite(element.duration) ? element.duration : 0);
        element.onerror = () => resolve(0);
        element.src = src;
    });
}

/** Resolve a node's media content URL from storageKey if needed.
 *  After lazy-hydrate, `content` may be a stale blob URL; this ensures a valid URL for user actions. */
async function resolveNodeContent(node: CanvasNodeData): Promise<string> {
    const { storageKey, content } = node.metadata ?? {};
    if (!content && !storageKey) return "";
    if (node.type === CanvasNodeType.Image) return resolveImageUrl(storageKey, content ?? "");
    return resolveMediaUrl(storageKey, content ?? "");
}

async function hydrateCanvasImages(nodes: CanvasNodeData[]) {
    return Promise.all(
        nodes.map(async (node) => {
            const content = node.metadata?.content;
            // Image/Video/Audio: defer URL resolution to component (lazy hydrate)
            if (node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) return node;
            if (node.type === CanvasNodeType.Image && node.metadata?.storageKey) return node;
            if (node.type !== CanvasNodeType.Image || !content) return node;
            if (!content.startsWith("data:image/")) return node;
            return { ...node, metadata: { ...node.metadata, ...imageMetadata(await uploadImage(content)) } };
        }),
    );
}

async function hydrateAssistantImages(sessions: CanvasAssistantSession[]) {
    const hydrateItem = async (item: CanvasAssistantReference) => {
        if (item.type === CanvasNodeType.Video) {
            if (!item.storageKey) return item;
            return { ...item, mediaUrl: await resolveMediaUrl(item.storageKey, item.mediaUrl || "") };
        }
        if (item.storageKey) return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        if (item.dataUrl?.startsWith("data:image/")) {
            const image = await uploadImage(item.dataUrl);
            return { ...item, dataUrl: image.url, storageKey: image.storageKey };
        }
        return item;
    };
    return Promise.all(
        sessions.map(async (session) => ({
            ...session,
            messages: await Promise.all(
                session.messages.map(async (message) => ({
                    ...message,
                    references: await Promise.all((message.references || []).map(hydrateItem)),
                })),
            ),
        })),
    );
}

function getGenerationCount(count: string) {
    return Math.max(1, Math.min(15, Math.floor(Math.abs(Number(count)) || 1)));
}

function applyNodeConfigPatch(node: CanvasNodeData, patch: Partial<CanvasNodeData["metadata"]>) {
    const safePatch = patch || {};
    const patchEntries = Object.entries(safePatch);
    if (!patchEntries.length || patchEntries.every(([key, value]) => Object.is(node.metadata?.[key as keyof CanvasNodeData["metadata"]], value))) return node;
    const nextMode = safePatch.generationMode || node.metadata?.generationMode;
    const nextHeight = node.type === CanvasNodeType.Config && nextMode !== "comfyui" ? getConfigNodeHeight(nextMode) : node.height;
    const next = { ...node, height: nextHeight, metadata: { ...node.metadata, ...safePatch } };
    const spec = node.type === CanvasNodeType.Video ? NODE_DEFAULT_SIZE[CanvasNodeType.Video] : NODE_DEFAULT_SIZE[CanvasNodeType.Image];
    const size = typeof safePatch.size === "string" && !node.metadata?.content ? nodeSizeFromRatio(safePatch.size, spec.width, spec.height) : null;
    return size && (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video) ? { ...next, ...size, position: { x: node.position.x + node.width / 2 - size.width / 2, y: node.position.y + node.height / 2 - size.height / 2 } } : next;
}

function getInputSummary(inputs: NodeGenerationInput[]) {
    return {
        textCount: inputs.filter((input) => input.type === "text").length,
        imageCount: inputs.filter((input) => input.type === "image").length,
        videoCount: inputs.filter((input) => input.type === "video").length,
        audioCount: inputs.filter((input) => input.type === "audio").length,
    };
}

function buildGenerationConfig(config: AiConfig, node: CanvasNodeData | undefined, mode: CanvasNodeGenerationMode): AiConfig {
    const defaultModel = mode === "image" ? config.imageModel : mode === "video" ? config.videoModel : mode === "audio" ? config.audioModel : config.textModel;
    const selectedModel = normalizeRuntimeModelOption(config, node?.metadata?.model || defaultModel, mode)
        || normalizeRuntimeModelOption(config, defaultModel, mode)
        || (mode === "audio" ? defaultConfig.audioModel : config.model || defaultConfig.model);
    return {
        ...config,
        model: selectedModel,
        quality: node?.metadata?.quality || config.quality || defaultConfig.quality,
        resolution: node?.metadata?.resolution || config.resolution || defaultConfig.resolution,
        size: node?.metadata?.size || config.size || defaultConfig.size,
        videoSeconds: node?.metadata?.seconds || config.videoSeconds || defaultConfig.videoSeconds,
        vquality: node?.metadata?.vquality || config.vquality || defaultConfig.vquality,
        videoGenerateAudio: node?.metadata?.generateAudio || config.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node?.metadata?.watermark || config.videoWatermark || defaultConfig.videoWatermark,
        videoDraft: node?.metadata?.draft || config.videoDraft || defaultConfig.videoDraft,
        audioVoice: node?.metadata?.audioVoice || config.audioVoice || defaultConfig.audioVoice,
        audioFormat: node?.metadata?.audioFormat || config.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node?.metadata?.audioSpeed || config.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: node?.metadata?.audioInstructions || config.audioInstructions || defaultConfig.audioInstructions,
        count: String(node?.metadata?.count || (mode === "image" ? config.canvasImageCount || config.count : config.count) || defaultConfig.count),
    };
}

function mergeActiveGenerationNodes(restoredNodes: CanvasNodeData[], liveNodes: CanvasNodeData[], activeNodeIds: Set<string>) {
    if (!activeNodeIds.size) return restoredNodes;
    const liveById = new Map(liveNodes.map((node) => [node.id, node]));
    const restoredIds = new Set(restoredNodes.map((node) => node.id));
    const merged = restoredNodes.map((node) => (activeNodeIds.has(node.id) ? liveById.get(node.id) || node : node));
    activeNodeIds.forEach((id) => {
        const liveNode = liveById.get(id);
        if (liveNode && !restoredIds.has(id)) merged.push(liveNode);
    });
    return merged;
}

function resetInterruptedGeneration(nodes: CanvasNodeData[]) {
    return nodes.map((node) =>
        node.metadata?.status === "loading"
        && !node.metadata.generationJobId
        && !(node.type === CanvasNodeType.Video && node.metadata.videoTask && node.metadata.videoTaskStartedAt)
            ? hasPersistedMediaOutput(node)
                ? { ...node, metadata: { ...node.metadata, status: "success" as const, errorDetails: undefined } }
                : { ...node, metadata: { ...node.metadata, status: "error" as const, errorDetails: "页面刷新后生成已中断，请重新生成。" } }
            : node,
    );
}

function hasPersistedMediaOutput(node: CanvasNodeData) {
    if (node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) return false;
    return Boolean(node.metadata?.storageKey || node.metadata?.content);
}

function isGenerationCanceled(error: unknown) {
    return error instanceof Error && (error.message === "请求已取消" || error.name === "AbortError");
}

function findRetrySourceNode(nodeId: string, nodeById: Map<string, CanvasNodeData>, incomingByNodeId: Map<string, CanvasConnection[]>) {
    const queue = (incomingByNodeId.get(nodeId) || []).map((connection) => connection.fromNodeId);
    const visited = new Set<string>();
    while (queue.length) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const node = nodeById.get(id);
        if (isGenerationConfigNode(node?.type)) return node;
        incomingByNodeId.get(id)?.forEach((connection) => queue.push(connection.fromNodeId));
    }
    return null;
}

function sourceNodeReferenceImages(node: CanvasNodeData | null) {
    if (!node || node.type !== CanvasNodeType.Image || !node.metadata?.content) return [];
    return [
        {
            id: node.id,
            name: `${node.title || node.id}.png`,
            type: node.metadata.mimeType || "image/png",
            dataUrl: node.metadata.content,
            storageKey: node.metadata.storageKey,
        },
    ];
}

function isAudioFile(file: File) {
    return file.type.startsWith("audio/") || /\.(mp3|wav)$/i.test(file.name);
}

function isTextFile(file: File) {
    return file.type.startsWith("text/") || /\.(txt|md|markdown|srt)$/i.test(file.name);
}

function isScriptTextFile(file: File) {
    return /\.(md|markdown|srt)$/i.test(file.name) || /script|剧本|脚本|分镜/i.test(file.name);
}

function buildAngleLabel(params: CanvasImageAngleParams) {
    const horizontal = params.horizontalAngle === 0 ? "正面视角" : params.horizontalAngle > 0 ? `向右旋转 ${params.horizontalAngle} 度` : `向左旋转 ${Math.abs(params.horizontalAngle)} 度`;
    const pitch = params.pitchAngle === 0 ? "水平视角" : params.pitchAngle > 0 ? `俯视 ${params.pitchAngle} 度` : `仰视 ${Math.abs(params.pitchAngle)} 度`;
    return `AI 多角度：${horizontal}，${pitch}，镜头距离 ${params.cameraDistance.toFixed(1)}，${params.wideAngle ? "广角" : "标准"}镜头`;
}

function PreviewImageContent({ node, onCapturePanorama }: { node: CanvasNodeData; onCapturePanorama: (dataUrl: string) => void | Promise<void> }) {
    if (node.metadata?.canvasTool === "panorama360") return <PreviewPanoramaContent node={node} onCapture={onCapturePanorama} />;

    const storageKey = node.metadata?.storageKey;
    const content = node.metadata?.content;
    const [src, setSrc] = useState<string | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let mounted = true;
        setError(false);
        resolveImageUrl(storageKey, content ?? "")
            .then((url) => {
                if (!mounted) return;
                if (url) setSrc(url);
                else setError(true);
            })
            .catch(() => {
                if (mounted) setError(true);
            });
        return () => {
            mounted = false;
        };
    }, [content, storageKey]);

    if (error) {
        return (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 p-8">
                <p className="text-sm font-medium">图片加载失败</p>
                <p className="text-xs opacity-60">对象 URL 已失效或图片已被清理</p>
            </div>
        );
    }
    if (!src) return <div className="flex min-h-[40vh] items-center justify-center p-8 text-sm opacity-60">加载中…</div>;
    return <img src={src} alt={node.title || "图片"} style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain" }} onError={() => setError(true)} />;
}

function PreviewPanoramaContent({ node, onCapture }: { node: CanvasNodeData; onCapture: (dataUrl: string) => void | Promise<void> }) {
    const storageKey = node.metadata?.storageKey;
    const content = node.metadata?.content;
    const [src, setSrc] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        let mounted = true;
        setError("");
        resolveImageUrl(storageKey, content ?? "")
            .then((url) => {
                if (!mounted) return;
                if (url) setSrc(url);
                else setError("全景图加载失败");
            })
            .catch((err) => {
                if (mounted) setError(err instanceof Error ? err.message : "全景图加载失败");
            });
        return () => {
            mounted = false;
        };
    }, [content, storageKey]);

    if (error) {
        return (
            <div className="flex h-[76vh] w-[92vw] flex-col items-center justify-center gap-2 bg-black p-8 text-white">
                <p className="text-sm font-medium">{error}</p>
                <p className="text-xs text-white/55">请重新上传或重新生成 2:1 全景图</p>
            </div>
        );
    }
    if (!src) return <div className="flex h-[76vh] w-[92vw] items-center justify-center bg-black p-8 text-sm text-white/60">正在加载全景图…</div>;
    return <PanoramaImmersivePreview src={src} title={node.title} onCapture={onCapture} />;
}

function PanoramaImmersivePreview({ src, title, onCapture }: { src: string; title: string; onCapture: (dataUrl: string) => void | Promise<void> }) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rendererRef = useRef<any>(null);
    const renderRef = useRef<() => void>(() => {});
    const [textureSrc, setTextureSrc] = useState(src);
    const [error, setError] = useState("");
    const [textureReady, setTextureReady] = useState(false);
    const [capturing, setCapturing] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setError("");
        setTextureReady(false);
        if (!/^https?:/i.test(src)) {
            setTextureSrc(src);
            return;
        }
        setTextureSrc("");
        imageToDataUrl({ url: src })
            .then((dataUrl) => {
                if (!cancelled) setTextureSrc(dataUrl);
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : "全景贴图加载失败");
            });
        return () => {
            cancelled = true;
        };
    }, [src]);

    useEffect(() => {
        if (!textureSrc) return;
        const host = hostRef.current;
        if (!host) return;

        let disposed = false;
        let cleanupFn = () => {};

        // Three.js 仅在 360 预览组件首次渲染时按需加载，不污染主 bundle
        import("three").then((THREE) => {
            if (disposed) return;

            const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
            rendererRef.current = renderer;
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            renderer.setClearColor(0x000000, 1);
            host.appendChild(renderer.domElement);

            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1100);
            camera.position.set(0, 0, 0);
            let dragging = false;
            let yaw = 0;
            let pitch = 0;
            let pointerX = 0;
            let pointerY = 0;

            const geometry = new THREE.SphereGeometry(500, 96, 48);
            geometry.scale(-1, 1, 1);
            const loader = new THREE.TextureLoader();
            loader.setCrossOrigin("anonymous");
            const texture = loader.load(
                textureSrc,
                () => {
                    if (disposed) return;
                    setTextureReady(true);
                    render();
                },
                undefined,
                () => {
                    if (!disposed) {
                        setTextureReady(false);
                        setError("全景贴图加载失败");
                    }
                },
            );
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            const material = new THREE.MeshBasicMaterial({ map: texture });
            scene.add(new THREE.Mesh(geometry, material));

            const updateCameraDirection = () => {
                const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
                camera.lookAt(direction);
            };
            updateCameraDirection();

            const resize = () => {
                if (disposed) return;
                const width = Math.max(1, host.clientWidth);
                const height = Math.max(1, host.clientHeight);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
                renderer.setSize(width, height, false);
                render();
            };
            function render() {
                if (disposed) return;
                renderer.render(scene, camera);
            }
            renderRef.current = render;

            const handleWheel = (event: WheelEvent) => {
                event.preventDefault();
                event.stopPropagation();
                camera.fov = Math.max(35, Math.min(95, camera.fov + event.deltaY * 0.035));
                camera.updateProjectionMatrix();
                render();
            };
            const stopCanvasInteraction = (event: Event) => event.stopPropagation();
            const handlePointerDown = (event: PointerEvent) => {
                event.preventDefault();
                event.stopPropagation();
                dragging = true;
                pointerX = event.clientX;
                pointerY = event.clientY;
                renderer.domElement.setPointerCapture(event.pointerId);
                renderer.domElement.style.cursor = "grabbing";
            };
            const handlePointerMove = (event: PointerEvent) => {
                if (!dragging) return;
                event.preventDefault();
                event.stopPropagation();
                const deltaX = event.clientX - pointerX;
                const deltaY = event.clientY - pointerY;
                pointerX = event.clientX;
                pointerY = event.clientY;
                yaw -= deltaX * 0.004;
                pitch += deltaY * 0.004;
                pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, pitch));
                updateCameraDirection();
                render();
            };
            const handlePointerUp = (event: PointerEvent) => {
                if (!dragging) return;
                event.preventDefault();
                event.stopPropagation();
                dragging = false;
                renderer.domElement.releasePointerCapture(event.pointerId);
                renderer.domElement.style.cursor = "grab";
            };

            const observer = new ResizeObserver(resize);
            observer.observe(host);
            renderer.domElement.className = "nodrag nopan block h-full w-full";
            renderer.domElement.style.cursor = "grab";
            host.addEventListener("wheel", handleWheel, { passive: false });
            renderer.domElement.addEventListener("pointerdown", handlePointerDown);
            renderer.domElement.addEventListener("pointermove", handlePointerMove);
            renderer.domElement.addEventListener("pointerup", handlePointerUp);
            renderer.domElement.addEventListener("pointercancel", handlePointerUp);
            host.addEventListener("mousedown", stopCanvasInteraction);
            resize();

            cleanupFn = () => {
                observer.disconnect();
                host.removeEventListener("wheel", handleWheel);
                renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
                renderer.domElement.removeEventListener("pointermove", handlePointerMove);
                renderer.domElement.removeEventListener("pointerup", handlePointerUp);
                renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
                host.removeEventListener("mousedown", stopCanvasInteraction);
                texture.dispose();
                geometry.dispose();
                material.dispose();
                renderer.dispose();
                renderer.domElement.remove();
                rendererRef.current = null;
                renderRef.current = () => {};
            };
        });

        return () => {
            disposed = true;
            cleanupFn();
        };
    }, [textureSrc]);

    const capture = useCallback(async () => {
        const renderer = rendererRef.current;
        if (!renderer || !textureReady || error) return;
        setCapturing(true);
        try {
            renderRef.current();
            await onCapture(renderer.domElement.toDataURL("image/png"));
        } finally {
            setCapturing(false);
        }
    }, [error, onCapture, textureReady]);

    return (
        <div className="nodrag nopan relative h-[76vh] w-[92vw] overflow-hidden bg-black text-white" data-canvas-no-zoom>
            <div ref={hostRef} className="h-full w-full" aria-label={title || "360全景预览"} />
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-4">
                <div className="min-w-0 pr-4">
                    <div className="truncate text-sm font-medium">{title || "360全景预览"}</div>
                    <div className="text-xs text-white/55">左键拖动旋转视角，滚轮缩放 FOV</div>
                </div>
                <Button className="pointer-events-auto" type="primary" loading={capturing} disabled={!textureReady || !!error} onClick={capture}>
                    截图插入画布
                </Button>
            </div>
            {!textureReady || error ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/70">{error || "正在准备全景贴图"}</div> : null}
        </div>
    );
}

function buildAnglePrompt(params: CanvasImageAngleParams) {
    return `基于参考图重新生成同一主体的新视角，保持主体、颜色、材质和画面风格一致，不要只做透视变形。${buildAngleLabel(params)}。`;
}
