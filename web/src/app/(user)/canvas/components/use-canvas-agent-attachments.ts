"use client";

import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CanvasAgentChatAttachment } from "./canvas-agent-chat-ui";

type CanvasAgentUpload = CanvasAgentChatAttachment & {
    file: File;
    nodeId?: string;
};

export function useCanvasAgentAttachments(onUpload: (file: File) => Promise<string>, readyReferenceIds: string[]) {
    const [uploads, setUploads] = useState<CanvasAgentUpload[]>([]);
    const uploadsRef = useRef<CanvasAgentUpload[]>([]);

    useEffect(() => {
        uploadsRef.current = uploads;
    }, [uploads]);

    const releaseUpload = useCallback((upload: CanvasAgentUpload) => {
        URL.revokeObjectURL(upload.url);
    }, []);

    useEffect(() => {
        if (!readyReferenceIds.length) return;
        const readyIds = new Set(readyReferenceIds);
        setUploads((current) =>
            current.filter((upload) => {
                if (!upload.nodeId || !readyIds.has(upload.nodeId)) return true;
                releaseUpload(upload);
                return false;
            }),
        );
    }, [readyReferenceIds.join("|"), releaseUpload]);

    useEffect(
        () => () => {
            uploadsRef.current.forEach(releaseUpload);
        },
        [releaseUpload],
    );

    const uploadOne = useCallback(
        async (id: string, file: File) => {
            setUploads((current) => current.map((upload) => (upload.id === id ? { ...upload, status: "uploading", error: undefined } : upload)));
            try {
                const nodeId = await onUpload(file);
                setUploads((current) => current.map((upload) => (upload.id === id ? { ...upload, status: "ready", nodeId, error: undefined } : upload)));
            } catch (error) {
                const message = error instanceof Error ? error.message : "图片上传失败";
                setUploads((current) => current.map((upload) => (upload.id === id ? { ...upload, status: "failed", error: message } : upload)));
            }
        },
        [onUpload],
    );

    const addFiles = useCallback(
        async (files: FileList | File[] | null) => {
            const pending = Array.from(files || [])
                .filter((file) => file.type.startsWith("image/"))
                .map((file) => ({ id: nanoid(), name: file.name || "粘贴图片", url: URL.createObjectURL(file), status: "uploading" as const, file }));
            if (!pending.length) return;
            setUploads((current) => [...current, ...pending]);
            await Promise.all(pending.map((upload) => uploadOne(upload.id, upload.file)));
        },
        [uploadOne],
    );

    const retryUpload = useCallback(
        (id: string) => {
            const upload = uploadsRef.current.find((item) => item.id === id);
            if (upload) void uploadOne(id, upload.file);
        },
        [uploadOne],
    );

    const removeUpload = useCallback(
        (id: string) => {
            setUploads((current) =>
                current.filter((upload) => {
                    if (upload.id !== id) return true;
                    releaseUpload(upload);
                    return false;
                }),
            );
        },
        [releaseUpload],
    );

    return { uploads, addFiles, retryUpload, removeUpload };
}
