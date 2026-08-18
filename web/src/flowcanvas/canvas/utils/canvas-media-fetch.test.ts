import assert from "node:assert/strict";
import { test } from "vitest";

import { toFetchableMediaUrl } from "./canvas-media-fetch";

const ORIGIN = "https://startflows.example.cn";

test("toFetchableMediaUrl rewrites stale-origin same-site absolute URLs to current origin", () => {
    assert.equal(toFetchableMediaUrl("http://localhost:3000/api/reference-assets/abc?x=1", undefined, ORIGIN), "/api/reference-assets/abc?x=1");
    assert.equal(toFetchableMediaUrl("http://127.0.0.1:3000/api/generation-log-assets/k", undefined, ORIGIN), "/api/generation-log-assets/k");
});

test("toFetchableMediaUrl keeps current-origin and external URLs usable", () => {
    assert.equal(toFetchableMediaUrl(`${ORIGIN}/api/reference-assets/abc`, undefined, ORIGIN), "/api/reference-assets/abc");
    assert.equal(toFetchableMediaUrl("https://cdn.example.com/a.png", undefined, ORIGIN), "https://cdn.example.com/a.png");
    assert.equal(toFetchableMediaUrl("/api/reference-assets/abc", undefined, ORIGIN), "/api/reference-assets/abc");
});

test("toFetchableMediaUrl falls back to backend storage key path when source is empty", () => {
    assert.equal(toFetchableMediaUrl("", "backend:tok123", ORIGIN), "/api/reference-assets/tok123");
    assert.equal(toFetchableMediaUrl("", "image:local1", ORIGIN), "");
    assert.equal(toFetchableMediaUrl("", undefined, ORIGIN), "");
});
