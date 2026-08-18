import assert from "node:assert/strict";
import { test } from "vitest";

import { videoImageReferenceRole } from "@/flowcanvas/services/api/model-capabilities";

test("videoImageReferenceRole maps first/last frame modes to server roles", () => {
    assert.equal(videoImageReferenceRole("image-to-video", 0), "first_frame");
    assert.equal(videoImageReferenceRole("first-last-frame", 0), "first_frame");
    assert.equal(videoImageReferenceRole("first-last-frame", 1), "last_frame");
    assert.equal(videoImageReferenceRole("first-last-frame", 2), "reference");
});

test("videoImageReferenceRole keeps generic reference for other modes", () => {
    assert.equal(videoImageReferenceRole("image-reference", 0), "reference");
    assert.equal(videoImageReferenceRole("multi-frame", 1), "reference");
    assert.equal(videoImageReferenceRole(undefined, 0), "reference");
});
