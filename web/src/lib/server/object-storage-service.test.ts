import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dataRoot: `${process.cwd()}/.tmp-object-storage-${process.pid}` }));
const mocks = vi.hoisted(() => ({
    config: vi.fn(),
    assertConfigured: vi.fn(),
    putBytes: vi.fn(),
    putFile: vi.fn(),
    deleteObjects: vi.fn(),
    objectExists: vi.fn(),
    getBytes: vi.fn(),
    signRead: vi.fn(),
    listObjects: vi.fn(),
    testConnection: vi.fn(),
    register: vi.fn(),
    listMigrationRegistrations: vi.fn(),
    listByObjectKeys: vi.fn(),
    deleteRegistrations: vi.fn(),
    references: vi.fn(),
}));

vi.mock("@/lib/server/data-dir", () => ({ resolveServerDataPath: (name: string) => join(state.dataRoot, name) }));
vi.mock("@/lib/server/object-storage-config", () => ({
    getObjectStorageRuntimeConfig: mocks.config,
    assertObjectStorageConfigured: mocks.assertConfigured,
}));
vi.mock("@/lib/server/object-storage-client", () => ({
    putObjectBytes: mocks.putBytes,
    putObjectFile: mocks.putFile,
    deleteObjects: mocks.deleteObjects,
    objectExists: mocks.objectExists,
    getObjectBytes: mocks.getBytes,
    signObjectRead: mocks.signRead,
    listObjects: mocks.listObjects,
    testObjectStorageConnection: mocks.testConnection,
}));
vi.mock("@/lib/server/local-media-registry", () => ({
    registerLocalMediaAsset: mocks.register,
    listLocalMediaMigrationRegistrations: mocks.listMigrationRegistrations,
    listMediaRegistrationsByExternalObjectKeys: mocks.listByObjectKeys,
    deleteLocalMediaRegistrations: mocks.deleteRegistrations,
}));
vi.mock("@/lib/server/local-media-references", () => ({ countLocalMediaReferences: mocks.references }));

import { createExternalMediaReadUrl, createExternalStorageImagePreviewUrl, deleteExternalStorageFiles, listExternalStorageFiles, migrateLocalMediaToObjectStorage, persistExternalMediaIfEnabled } from "./object-storage-service";

const config = {
    id: "default" as const,
    enabled: true,
    endpoint: "https://oss.example.com",
    region: "auto",
    bucket: "media",
    prefix: "vozeb-pro",
    accessKeyId: "access",
    secretAccessKey: "secret",
    forcePathStyle: false,
};
const registration = {
    storageKey: "permanent/2026/07/24/images/file.png",
    scope: "reference" as const,
    storageClass: "permanent" as const,
    type: "image" as const,
    ownerUserId: "user-one",
    originalName: "原图.png",
    source: "user-upload",
    mimeType: "image/png",
    bytes: 4,
    createdAt: "2026-07-24T00:00:00.000Z",
};

describe("object storage media service", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await rm(state.dataRoot, { recursive: true, force: true });
        mocks.config.mockResolvedValue(config);
        mocks.register.mockImplementation(async (value) => value);
        mocks.listMigrationRegistrations.mockResolvedValue({ items: [], total: 0 });
        mocks.listByObjectKeys.mockResolvedValue([]);
        mocks.references.mockResolvedValue(new Map());
        mocks.listObjects.mockResolvedValue({ items: [], nextCursor: undefined });
        mocks.signRead.mockResolvedValue("https://oss.example.com/signed");
        mocks.objectExists.mockResolvedValue(true);
        mocks.deleteObjects.mockResolvedValue(undefined);
    });

    afterAll(async () => {
        await rm(state.dataRoot, { recursive: true, force: true });
    });

    it("writes nothing to object storage while the switch is disabled", async () => {
        mocks.config.mockResolvedValue({ ...config, enabled: false });

        await expect(persistExternalMediaIfEnabled({ registration, bytes: Buffer.from("data") })).resolves.toBeNull();
        expect(mocks.putBytes).not.toHaveBeenCalled();
        expect(mocks.register).not.toHaveBeenCalled();
    });

    it("uploads and registers object media, rolling the object back when registration fails", async () => {
        const objectKey = `vozeb-pro/media/reference/${registration.storageKey}`;
        await persistExternalMediaIfEnabled({ registration, bytes: Buffer.from("data") });
        expect(mocks.putBytes).toHaveBeenCalledWith(config, expect.objectContaining({ key: objectKey, contentType: "image/png" }));
        expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({ storageProvider: "object", externalObjectKey: objectKey }));

        mocks.register.mockRejectedValueOnce(new Error("registry failed"));
        await expect(persistExternalMediaIfEnabled({ registration, bytes: Buffer.from("data") })).rejects.toThrow("registry failed");
        expect(mocks.deleteObjects).toHaveBeenCalledWith(config, [objectKey]);
    });

    it("continues signing existing object media after the write switch is disabled", async () => {
        mocks.config.mockResolvedValue({ ...config, enabled: false });
        const objectRegistration = { ...registration, originalName: "生成结果", storageProvider: "object" as const, externalStorageId: "default", externalObjectKey: "vozeb-pro/media/reference/file.png" };

        const url = await createExternalMediaReadUrl(new Request("http://localhost/media?download=original"), objectRegistration);

        expect(url).toBe("https://oss.example.com/signed");
        expect(mocks.signRead).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }), expect.objectContaining({ key: objectRegistration.externalObjectKey, contentDisposition: expect.stringContaining("attachment"), expiresIn: 600 }));
        expect(mocks.signRead).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ contentDisposition: expect.stringContaining(".png") }));
    });

    it("uses a bounded WebP object variant for image previews", async () => {
        const objectRegistration = { ...registration, storageProvider: "object" as const, externalStorageId: "default", externalObjectKey: "vozeb-pro/media/reference/file.png" };

        await createExternalMediaReadUrl(new Request("http://localhost/media?format=webp&width=320"), objectRegistration);

        expect(mocks.objectExists).toHaveBeenCalledWith(config, "vozeb-pro/media/reference/file.png.vozeb-preview/webp-320.webp");
        expect(mocks.getBytes).not.toHaveBeenCalled();
        expect(mocks.signRead).toHaveBeenCalledWith(config, expect.objectContaining({ contentType: "image/webp", expiresIn: 120 }));
    });

    it("serves administrator object previews as bounded WebP variants only", async () => {
        const imageKey = "vozeb-pro/media/reference/file.png";

        await expect(createExternalStorageImagePreviewUrl(imageKey, "500")).resolves.toBe("https://oss.example.com/signed");

        expect(mocks.objectExists).toHaveBeenCalledWith(config, `${imageKey}.vozeb-preview/webp-640.webp`);
        expect(mocks.signRead).toHaveBeenCalledWith(config, expect.objectContaining({ key: `${imageKey}.vozeb-preview/webp-640.webp`, contentType: "image/webp", contentDisposition: expect.stringContaining("file.webp") }));
        await expect(createExternalStorageImagePreviewUrl("outside-prefix/file.png", 256)).resolves.toBeNull();
        await expect(createExternalStorageImagePreviewUrl("vozeb-pro/files/archive.zip", 256)).resolves.toBeNull();
    });

    it("keeps streaming media urls valid long enough for playback and seeking", async () => {
        const videoRegistration = { ...registration, type: "video" as const, mimeType: "video/mp4", storageProvider: "object" as const, externalStorageId: "default", externalObjectKey: "vozeb-pro/media/reference/video.mp4" };

        await createExternalMediaReadUrl(new Request("http://localhost/media"), videoRegistration);

        expect(mocks.signRead).toHaveBeenCalledWith(config, expect.objectContaining({ key: videoRegistration.externalObjectKey, expiresIn: 3600 }));
    });

    it("blocks deletion of referenced objects and deletes unregistered objects", async () => {
        const protectedKey = "vozeb-pro/media/reference/protected.png";
        const freeKey = "vozeb-pro/media/reference/free.png";
        mocks.listByObjectKeys.mockResolvedValue([{ ...registration, storageProvider: "object", externalObjectKey: protectedKey }]);
        mocks.references.mockResolvedValue(new Map([[registration.storageKey, 2]]));

        const result = await deleteExternalStorageFiles([protectedKey, freeKey, "outside-prefix/file.png"]);

        expect(result).toEqual({ deleted: 1, blocked: [{ key: protectedKey, storageKey: registration.storageKey, referenceCount: 2 }] });
        expect(mocks.deleteObjects).toHaveBeenCalledWith(config, [freeKey]);
        expect(mocks.deleteRegistrations).toHaveBeenCalledWith([]);
    });

    it("classifies attachments and fills a filtered page across object cursors", async () => {
        const attachmentKey = "vozeb-pro/files/archive.zip";
        const imageKey = "vozeb-pro/media/reference/permanent/2026/07/24/images/drama.png";
        mocks.listObjects.mockResolvedValueOnce({ items: [{ key: attachmentKey, bytes: 8 }], nextCursor: "next" }).mockResolvedValueOnce({ items: [{ key: imageKey, bytes: 4 }], nextCursor: undefined });
        mocks.listByObjectKeys.mockImplementation(async (keys: string[]) => (keys.includes(imageKey) ? [{ ...registration, source: "drama-render", storageProvider: "object", externalObjectKey: imageKey }] : []));

        const result = await listExternalStorageFiles({ limit: 2, type: "image", source: "drama" });

        expect(mocks.listObjects).toHaveBeenCalledTimes(2);
        expect(result.items).toEqual([expect.objectContaining({ key: imageKey, type: "image", source: "drama-render", previewUrl: `/api/admin/object-storage/files/preview?key=${encodeURIComponent(imageKey)}` })]);
        expect(result.nextCursor).toBeUndefined();

        mocks.listObjects.mockReset().mockResolvedValue({ items: [{ key: imageKey, bytes: 4 }], nextCursor: undefined });
        await expect(listExternalStorageFiles({ limit: 2, ownerUserId: "user-two" })).resolves.toMatchObject({ items: [] });

        mocks.listObjects.mockReset().mockResolvedValue({ items: [{ key: attachmentKey, bytes: 8 }], nextCursor: undefined });
        mocks.listByObjectKeys.mockResolvedValue([]);
        await expect(listExternalStorageFiles({ limit: 2, type: "attachment" })).resolves.toMatchObject({ items: [expect.objectContaining({ key: attachmentKey, type: "attachment" })] });
    });

    it("deletes a local source only after object upload and registry update succeed", async () => {
        const filePath = resolve(state.dataRoot, "reference-assets", registration.storageKey);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, "data");
        mocks.listMigrationRegistrations.mockResolvedValue({ items: [registration], total: 1 });

        const result = await migrateLocalMediaToObjectStorage(20);

        expect(result).toMatchObject({ migrated: 1, failed: 0, remaining: 0 });
        await expect(access(filePath)).rejects.toBeTruthy();
        expect(mocks.putFile).toHaveBeenCalledWith(config, expect.objectContaining({ filePath, bytes: 4 }));
        expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({ storageProvider: "object" }));
    });

    it("keeps the local source when object registration fails during migration", async () => {
        const filePath = resolve(state.dataRoot, "reference-assets", registration.storageKey);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, "data");
        mocks.listMigrationRegistrations.mockResolvedValue({ items: [registration], total: 1 });
        mocks.register.mockRejectedValueOnce(new Error("registry failed"));

        const result = await migrateLocalMediaToObjectStorage(20);

        expect(result).toMatchObject({ migrated: 0, failed: 1, remaining: 1 });
        await expect(access(filePath)).resolves.toBeUndefined();
        expect(mocks.deleteObjects).toHaveBeenCalled();
    });

    it("continues through bounded database pages when early registrations have no local file", async () => {
        const missing = Array.from({ length: 100 }, (_, index) => ({ ...registration, storageKey: `permanent/missing-${index}.png` }));
        const filePath = resolve(state.dataRoot, "reference-assets", registration.storageKey);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, "data");
        mocks.listMigrationRegistrations
            .mockReset()
            .mockResolvedValueOnce({ items: missing, total: 101 })
            .mockResolvedValueOnce({ items: [registration], total: 101 });

        const result = await migrateLocalMediaToObjectStorage(1);

        expect(mocks.listMigrationRegistrations).toHaveBeenNthCalledWith(1, { limit: 100, offset: 0 });
        expect(mocks.listMigrationRegistrations).toHaveBeenNthCalledWith(2, { limit: 100, offset: 100 });
        expect(result).toMatchObject({ migrated: 1, skipped: 100, remaining: 100 });
    });
});
