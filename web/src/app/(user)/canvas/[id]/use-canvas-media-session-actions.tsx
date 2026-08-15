"use client";

import type { ChangeEvent as ReactChangeEvent, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from "react";
import { useCallback } from "react";

import { droppedFiles, preventFileDragEvent } from "@/lib/file-drop";
import { readImageMeta } from "@/lib/image-utils";
import { uploadMediaFile } from "@/services/file-storage";
import { NODE_DEFAULT_SIZE } from "../constants";
import { CanvasNodeType, type CanvasAssistantSession, type Position } from "../types";
import { fitNodeSize } from "../utils/canvas-node-size";
import { PANORAMA_IMAGE_SIZE, isPanoramaRatio } from "../utils/canvas-panorama";

import { CANVAS_DROP_NODE_OFFSET, VIDEO_NODE_MAX_HEIGHT, VIDEO_NODE_MAX_WIDTH } from "./canvas-page-elements";
import { audioMetadata, imageMetadata, isAudioFile, replaceCanvasNodeMediaMetadata, uploadCanvasImage, videoMetadata } from "./canvas-page-utils";

import type { CanvasInteractions } from "./use-canvas-interactions";
import type { CanvasPageState } from "./use-canvas-page-state";

import type { CanvasFileActions } from "./use-canvas-file-actions";

export function useCanvasMediaSessionActions({ state, interactions, files }: { state: CanvasPageState; interactions: CanvasInteractions; files: CanvasFileActions }) {
    const {
        message,
        projectId,
        containerRef,
        imageInputRef,
        uploadTargetRef,
        renameProject,
        currentProject,
        setNodes,
        setChatSessions,
        setActiveChatId,
        size,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setDialogNodeId,
        setTitleEditing,
        titleDraft,
        setTitleDraft,
        nodesRef,
    } = state;
    const { screenToCanvas } = interactions;
    const { createImageFileNode, createVideoFileNode, createAudioFileNode } = files;

    const handleUploadRequest = useCallback((nodeId?: string, position?: Position) => {
        uploadTargetRef.current = { nodeId, position };
        imageInputRef.current?.click();
    }, []);

    const handleImageInputChange = useCallback(
        async (event: ReactChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            const target = uploadTargetRef.current;
            if (!file) return;
            if (!file.type.startsWith("image/") && !file.type.startsWith("video/") && !isAudioFile(file)) {
                uploadTargetRef.current = null;
                event.target.value = "";
                message.error("请选择图片、视频、MP3 或 WAV 文件");
                return;
            }

            try {
                if (target?.nodeId) {
                    if (isAudioFile(file)) {
                        const audio = await uploadMediaFile(file, "audio");
                        const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                        setNodes((prev) =>
                            prev.map((node) =>
                                node.id === target.nodeId
                                    ? {
                                          ...node,
                                          type: CanvasNodeType.Audio,
                                          title: file.name,
                                          position: { x: node.position.x + node.width / 2 - spec.width / 2, y: node.position.y + node.height / 2 - spec.height / 2 },
                                          width: spec.width,
                                          height: spec.height,
                                          metadata: replaceCanvasNodeMediaMetadata(node.metadata, audioMetadata(audio)),
                                      }
                                    : node,
                            ),
                        );
                        setSelectedNodeIds(new Set([target.nodeId]));
                        setSelectedConnectionId(null);
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
                                          title: file.name,
                                          position: { x: node.position.x + node.width / 2 - nextSize.width / 2, y: node.position.y + node.height / 2 - nextSize.height / 2 },
                                          width: nextSize.width,
                                          height: nextSize.height,
                                          metadata: replaceCanvasNodeMediaMetadata(node.metadata, videoMetadata(video)),
                                      }
                                    : node,
                            ),
                        );
                        setSelectedNodeIds(new Set([target.nodeId]));
                        setSelectedConnectionId(null);
                        setDialogNodeId(target.nodeId);
                        return;
                    }
                    const targetNode = nodesRef.current.find((node) => node.id === target.nodeId);
                    const isPanorama = targetNode?.type === CanvasNodeType.Panorama;
                    if (isPanorama) {
                        const objectUrl = URL.createObjectURL(file);
                        const dimensions = await readImageMeta(objectUrl).finally(() => URL.revokeObjectURL(objectUrl));
                        if (!isPanoramaRatio(dimensions.width, dimensions.height)) {
                            message.error("全景图必须接近 2:1 比例，例如 2048x1024");
                            return;
                        }
                    }
                    const image = await uploadCanvasImage(file);
                    const imageSize = isPanorama ? NODE_DEFAULT_SIZE[CanvasNodeType.Panorama] : fitNodeSize(image.width, image.height);
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === target.nodeId
                                ? {
                                      ...node,
                                      type: isPanorama ? CanvasNodeType.Panorama : CanvasNodeType.Image,
                                      title: file.name,
                                      position: { x: node.position.x + node.width / 2 - imageSize.width / 2, y: node.position.y + node.height / 2 - imageSize.height / 2 },
                                      width: imageSize.width,
                                      height: imageSize.height,
                                      metadata: replaceCanvasNodeMediaMetadata(node.metadata, imageMetadata(image), isPanorama ? { size: PANORAMA_IMAGE_SIZE, panoramaProjection: "equirectangular" } : undefined),
                                  }
                                : node,
                        ),
                    );
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                    setDialogNodeId(target.nodeId);
                } else {
                    const position = target?.position || screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                    await (isAudioFile(file) ? createAudioFileNode(file, position) : file.type.startsWith("video/") ? createVideoFileNode(file, position) : createImageFileNode(file, position));
                }
            } catch (error) {
                message.error(error instanceof Error ? error.message : "文件添加失败，请稍后重试");
            } finally {
                uploadTargetRef.current = null;
                event.target.value = "";
            }
        },
        [createAudioFileNode, createImageFileNode, createVideoFileNode, message, nodesRef, screenToCanvas, size.height, size.width],
    );

    const handleDrop = useCallback(
        (event: ReactDragEvent<HTMLDivElement>) => {
            if (!preventFileDragEvent(event)) return;
            const files = droppedFiles(event, (item) => item.type.startsWith("image/") || item.type.startsWith("video/") || isAudioFile(item));
            if (!files.length) return;

            const pos = screenToCanvas(event.clientX, event.clientY);
            setSelectedNodeIds(new Set());
            setSelectedConnectionId(null);
            const creations = files.map((file, index) => {
                const nextPos = { x: pos.x + index * CANVAS_DROP_NODE_OFFSET, y: pos.y + index * CANVAS_DROP_NODE_OFFSET };
                return isAudioFile(file) ? createAudioFileNode(file, nextPos, true) : file.type.startsWith("video/") ? createVideoFileNode(file, nextPos, true, false) : createImageFileNode(file, nextPos, true, false);
            });
            void Promise.allSettled(creations).then((results) => {
                const failures = results.filter((result) => result.status === "rejected");
                if (failures.length) message.error(failures.length === files.length ? "文件添加失败" : `有 ${failures.length} 个文件添加失败`);
            });
        },
        [createAudioFileNode, createImageFileNode, createVideoFileNode, message, screenToCanvas, setSelectedConnectionId, setSelectedNodeIds],
    );

    const pasteAssistantImage = useCallback(
        async (file: File) => {
            const position = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const nodeId = await createImageFileNode(file, position, true);
            message.success("图片已添加到本轮引用");
            return nodeId;
        },
        [createImageFileNode, message, screenToCanvas, size.height, size.width],
    );

    const handleAssistantSessionsChange = useCallback((sessions: CanvasAssistantSession[], activeId: string | null) => {
        setChatSessions(sessions);
        setActiveChatId(activeId);
    }, []);

    const startTitleEditing = useCallback(() => {
        setTitleDraft(currentProject?.title || "未命名画布");
        setTitleEditing(true);
    }, [currentProject?.title]);

    const finishTitleEditing = useCallback(() => {
        const nextTitle = titleDraft.trim();
        if (nextTitle) renameProject(projectId, nextTitle);
        setTitleEditing(false);
    }, [projectId, renameProject, titleDraft]);

    const preventCanvasContextMenu = useCallback((event: ReactMouseEvent) => {
        if ((event.target as HTMLElement).closest("[data-node-id]")) return;
        event.preventDefault();
        setContextMenu(null);
    }, []);
    return {
        handleUploadRequest,
        handleImageInputChange,
        handleDrop,
        pasteAssistantImage,
        handleAssistantSessionsChange,
        startTitleEditing,
        finishTitleEditing,
        preventCanvasContextMenu,
    };
}

export type CanvasMediaSessionActions = ReturnType<typeof useCanvasMediaSessionActions>;
