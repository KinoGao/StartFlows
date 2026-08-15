import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCreateDraftAttachment, useCreateDraftAttachmentsStore } from "./use-create-draft-attachments-store";

describe("create draft attachments store", () => {
    beforeEach(() => useCreateDraftAttachmentsStore.setState({ attachments: [] }));

    afterEach(() => {
        useCreateDraftAttachmentsStore.getState().clear();
        vi.restoreAllMocks();
    });

    it("keeps an unsent file in memory until it is explicitly removed", () => {
        const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:create-reference");
        const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
        const file = new File(["image"], "reference.webp", { type: "image/webp" });

        const [asset] = useCreateDraftAttachmentsStore.getState().add([file], "");

        expect(createObjectUrl).toHaveBeenCalledWith(file);
        expect(asset.serverUrl).toBe("blob:create-reference");
        expect(getCreateDraftAttachment(asset.id)?.file).toBe(file);
        expect(getCreateDraftAttachment(asset.id)?.asset).toBe(asset);

        useCreateDraftAttachmentsStore.getState().remove([asset.id]);

        expect(getCreateDraftAttachment(asset.id)).toBeUndefined();
        expect(revokeObjectUrl).toHaveBeenCalledWith("blob:create-reference");
    });

    it("keeps every explicitly selected draft attachment", () => {
        vi.spyOn(URL, "createObjectURL").mockImplementation((file) => `blob:${(file as File).name}`);
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
        const files = Array.from({ length: 24 }, (_, index) => new File([String(index)], `reference-${index}.webp`, { type: "image/webp" }));

        const assets = useCreateDraftAttachmentsStore.getState().add(files, "");

        expect(assets).toHaveLength(24);
        expect(useCreateDraftAttachmentsStore.getState().attachments).toHaveLength(24);
        expect(files.every((file, index) => getCreateDraftAttachment(assets[index].id)?.file === file)).toBe(true);
    });
});
