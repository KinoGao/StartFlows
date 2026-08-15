import { describe, expect, it } from "vitest";

import { agentTaskResultItems } from "./agent-run-result-items";

describe("agentTaskResultItems", () => {
    it("flattens nested batch responses without losing result order", () => {
        expect(
            agentTaskResultItems({
                results: [{ results: [{ url: "one" }, { url: "two" }] }, { outputs: [{ url: "three" }] }],
            }),
        ).toEqual([{ url: "one" }, { url: "two" }, { url: "three" }]);
    });

    it("limits untrusted result arrays to ten outputs", () => {
        expect(agentTaskResultItems({ images: Array.from({ length: 20 }, (_, index) => ({ url: String(index) })) })).toHaveLength(10);
    });

    it("normalizes provider wrappers and alternative media list keys", () => {
        expect(agentTaskResultItems({ task: { result: { data: { videos: [{ url: "one.mp4" }, { url: "two.mp4" }] } } } })).toEqual([{ url: "one.mp4" }, { url: "two.mp4" }]);
        expect(agentTaskResultItems({ output: { assets: [{ url: "one.png" }] } })).toEqual([{ url: "one.png" }]);
    });
});
