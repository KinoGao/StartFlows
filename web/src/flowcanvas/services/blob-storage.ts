type BlobStore = {
    getItem<T>(key: string): Promise<T | null>;
    setItem<T>(key: string, value: T): Promise<T>;
    removeItem(key: string): Promise<void>;
    iterate<T, U>(iteratorCallback: (value: T, key: string, iterationNumber: number) => U): Promise<U>;
};

type BlobStorage = {
    getBlob: (storageKey: string) => Promise<Blob | null>;
    setBlob: (storageKey: string, blob: Blob) => Promise<string>;
    resolveUrl: (storageKey?: string, fallback?: string) => Promise<string>;
    peekUrl: (storageKey?: string) => string | undefined;
    deleteBlobs: (keys: Iterable<string>) => Promise<void>;
    removeUnused: (usedKeys: Set<string>) => Promise<void>;
};

export function createBlobStorage(store: BlobStore): BlobStorage {
    const objectUrls = new Map<string, string>();
    const pendingUrls = new Map<string, Promise<string>>();

    const revokeCachedUrl = (storageKey: string) => {
        const cached = objectUrls.get(storageKey);
        if (cached) URL.revokeObjectURL(cached);
        objectUrls.delete(storageKey);
    };

    const getBlob = (storageKey: string) => store.getItem<Blob>(storageKey);

    const deleteBlobs = async (keys: Iterable<string>) => {
        await Promise.all(
            Array.from(new Set(keys)).map(async (key) => {
                pendingUrls.delete(key);
                revokeCachedUrl(key);
                await store.removeItem(key);
            }),
        );
    };

    return {
        getBlob,
        async setBlob(storageKey, blob) {
            await store.setItem(storageKey, blob);
            pendingUrls.delete(storageKey);
            revokeCachedUrl(storageKey);
            const url = URL.createObjectURL(blob);
            objectUrls.set(storageKey, url);
            return url;
        },
        resolveUrl(storageKey, fallback = "") {
            if (!storageKey) return Promise.resolve(fallback);
            const cached = objectUrls.get(storageKey);
            if (cached) return Promise.resolve(cached);
            const pending = pendingUrls.get(storageKey);
            if (pending) return pending;
            const promise = store
                .getItem<Blob>(storageKey)
                .then((blob) => {
                    pendingUrls.delete(storageKey);
                    if (!blob) return fallback.startsWith("blob:") ? "" : fallback;
                    const existing = objectUrls.get(storageKey);
                    if (existing) return existing;
                    const url = URL.createObjectURL(blob);
                    objectUrls.set(storageKey, url);
                    return url;
                })
                .catch((error: unknown) => {
                    pendingUrls.delete(storageKey);
                    throw error;
                });
            pendingUrls.set(storageKey, promise);
            return promise;
        },
        peekUrl(storageKey) {
            return storageKey ? objectUrls.get(storageKey) : undefined;
        },
        deleteBlobs,
        async removeUnused(usedKeys) {
            const unused: string[] = [];
            await store.iterate<Blob, void>((_value, key) => {
                if (!usedKeys.has(key)) unused.push(key);
            });
            await deleteBlobs(unused);
        },
    };
}
