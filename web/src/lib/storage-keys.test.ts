import { describe, expect, it } from "vitest";

import { collectStorageKeys } from "./storage-keys";

describe("collectStorageKeys", () => {
    const isMediaKey = (value: string) => /^(image|video|file):/.test(value);

    it("collects matching storageKey fields once and ignores raw strings by default", () => {
        const value = { storageKey: "image:one", nested: [{ storageKey: "image:one" }, "video:raw", { storageKey: "other:value" }] };

        expect([...collectStorageKeys(value, isMediaKey)]).toEqual(["image:one"]);
    });

    it("can include matching raw string values for sync manifests", () => {
        const value = { nested: ["video:raw", "https://example.com/file.mp4", { storageKey: "file:field" }] };

        expect([...collectStorageKeys(value, isMediaKey, true)]).toEqual(["video:raw", "file:field"]);
    });
});
