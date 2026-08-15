const MAX_CACHE_ENTRIES = 64;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;

const cache = new Map<string, Buffer>();
const pendingBuffers = new Map<string, Promise<Buffer>>();
const pendingTasks = new Map<string, Promise<void>>();
let cacheBytes = 0;

export async function getOrCreateCachedImageVariant(key: string, create: () => Promise<Buffer>) {
    const cached = cache.get(key);
    if (cached) {
        cache.delete(key);
        cache.set(key, cached);
        return cached;
    }

    const pending = pendingBuffers.get(key);
    if (pending) return pending;

    const task = create()
        .then((value) => {
            addToCache(key, value);
            return value;
        })
        .finally(() => pendingBuffers.delete(key));
    pendingBuffers.set(key, task);
    return task;
}

export async function runImageVariantTaskOnce(key: string, task: () => Promise<void>) {
    const pending = pendingTasks.get(key);
    if (pending) return pending;
    const current = task().finally(() => pendingTasks.delete(key));
    pendingTasks.set(key, current);
    return current;
}

function addToCache(key: string, value: Buffer) {
    if (value.byteLength > MAX_CACHE_BYTES) return;
    const previous = cache.get(key);
    if (previous) cacheBytes -= previous.byteLength;
    cache.delete(key);
    cache.set(key, value);
    cacheBytes += value.byteLength;
    while (cache.size > MAX_CACHE_ENTRIES || cacheBytes > MAX_CACHE_BYTES) {
        const oldestKey = cache.keys().next().value;
        if (!oldestKey) break;
        const oldest = cache.get(oldestKey);
        cache.delete(oldestKey);
        cacheBytes -= oldest?.byteLength || 0;
    }
}
