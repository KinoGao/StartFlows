export const APP_STORAGE_NAME = "vozeb-pro";
export const APP_EXPORT_ID = "vozeb-pro-canvas";
const APP_STORAGE_PREFIX = "vozeb-pro";

export function appStorageKey(name: string) {
    return `${APP_STORAGE_PREFIX}:${name}`;
}

export function collectStorageKeys(value: unknown, isStorageKey: (key: string) => boolean, includeStringValues = false) {
    const keys = new Set<string>();
    const visit = (item: unknown) => {
        if (typeof item === "string") {
            if (includeStringValues && isStorageKey(item)) keys.add(item);
            return;
        }
        if (!item || typeof item !== "object") return;
        if ("storageKey" in item && typeof item.storageKey === "string" && isStorageKey(item.storageKey)) keys.add(item.storageKey);
        Object.values(item).forEach(visit);
    };
    visit(value);
    return keys;
}
