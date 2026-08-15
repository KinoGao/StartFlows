"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";

import type { CreativeAsset } from "@/lib/creative-runtime-contract";

type DraftAttachment = {
    asset: CreativeAsset;
    file: File;
};

type CreateDraftAttachmentsStore = {
    attachments: DraftAttachment[];
    add: (files: File[], conversationId: string) => CreativeAsset[];
    remove: (ids: Iterable<string>) => void;
    clear: () => void;
};

export const useCreateDraftAttachmentsStore = create<CreateDraftAttachmentsStore>()((set) => ({
    attachments: [],
    add: (files, conversationId) => {
        const now = Date.now();
        const additions = files.map((file, index) => {
            const previewUrl = URL.createObjectURL(file);
            return {
                file,
                asset: {
                    id: `draft-asset-${nanoid()}`,
                    userId: "draft",
                    conversationId,
                    ordinal: index,
                    type: draftAssetType(file.type),
                    status: "ready",
                    title: file.name,
                    serverUrl: previewUrl,
                    mimeType: file.type,
                    bytes: file.size,
                    metadata: { source: "draft-upload" },
                    createdAt: now + index,
                    updatedAt: now + index,
                },
            } satisfies DraftAttachment;
        });
        set((state) => {
            return { attachments: [...state.attachments, ...additions] };
        });
        return additions.map((item) => item.asset);
    },
    remove: (ids) => {
        const removedIds = new Set(ids);
        set((state) => {
            const removed = state.attachments.filter((item) => removedIds.has(item.asset.id));
            releaseDraftAttachments(removed);
            return { attachments: state.attachments.filter((item) => !removedIds.has(item.asset.id)) };
        });
    },
    clear: () =>
        set((state) => {
            releaseDraftAttachments(state.attachments);
            return { attachments: [] };
        }),
}));

export function getCreateDraftAttachment(id: string) {
    return useCreateDraftAttachmentsStore.getState().attachments.find((item) => item.asset.id === id);
}

function releaseDraftAttachments(attachments: DraftAttachment[]) {
    attachments.forEach((item) => URL.revokeObjectURL(item.asset.serverUrl || ""));
}

function draftAssetType(mimeType: string): CreativeAsset["type"] {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    return "audio";
}
