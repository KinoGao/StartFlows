import assert from "node:assert/strict";
import { test } from "vitest";

import { estimateCanvasTaskPoints, lookupModelBasePoints, type CanvasSessionPricing } from "./canvas-points-estimate";

const pricing: CanvasSessionPricing = {
    modelPointCosts: { "kling-o3": 10, "gpt-image-2": 4, free: 0 },
    generationPointMultipliers: {
        imageQuality: { high: 2 },
        videoQuality: { "1080": 1.5 },
        videoSeconds: { "10": 2 },
    },
};

test("lookupModelBasePoints resolves logical id, channel option and upstream name", () => {
    assert.equal(lookupModelBasePoints(pricing.modelPointCosts, "kling-o3"), 10);
    assert.equal(lookupModelBasePoints(pricing.modelPointCosts, "channel-x::kling-o3"), 10);
    assert.equal(lookupModelBasePoints(pricing.modelPointCosts, "free"), 0);
    assert.equal(lookupModelBasePoints(pricing.modelPointCosts, "unknown-model"), null);
    assert.equal(lookupModelBasePoints(pricing.modelPointCosts, ""), null);
});

test("estimateCanvasTaskPoints applies quality/seconds multipliers", () => {
    assert.equal(estimateCanvasTaskPoints(pricing, { type: "image", model: "gpt-image-2" }), 4);
    assert.equal(estimateCanvasTaskPoints(pricing, { type: "image", model: "gpt-image-2", quality: "high" }), 8);
    assert.equal(estimateCanvasTaskPoints(pricing, { type: "video", model: "kling-o3", quality: "1080", seconds: 10 }), 30);
    assert.equal(estimateCanvasTaskPoints(pricing, { type: "video", model: "unknown" }), null);
});
