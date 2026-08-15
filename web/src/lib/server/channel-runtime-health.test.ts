import { beforeEach, describe, expect, it } from "vitest";

import { filterHealthyRuntimeCandidates, getChannelRuntimeHealth, recordChannelRuntimeFailure, recordChannelRuntimeSuccess, resetChannelRuntimeHealth } from "./channel-runtime-health";

describe("channel runtime health", () => {
    beforeEach(() => resetChannelRuntimeHealth());

    it("cools a channel after consecutive failures and lets it recover after success", () => {
        recordChannelRuntimeFailure("primary", "text", "timeout", 1000);
        recordChannelRuntimeFailure("primary", "text", "timeout", 2000);
        expect(getChannelRuntimeHealth("primary", "text", 2000).cooldownUntil).toBeUndefined();
        recordChannelRuntimeFailure("primary", "text", "timeout", 3000);
        expect(getChannelRuntimeHealth("primary", "text", 3000).cooldownUntil).toBe(33000);
        recordChannelRuntimeSuccess("primary", "text", 4000);
        expect(getChannelRuntimeHealth("primary", "text", 4000)).toMatchObject({ consecutiveFailures: 0, lastSuccessAt: 4000 });
    });

    it("keeps healthy candidates ahead of cooling candidates and ignores cancellation", () => {
        recordChannelRuntimeFailure("primary", "image", "timeout", 1000);
        recordChannelRuntimeFailure("primary", "image", "timeout", 2000);
        recordChannelRuntimeFailure("primary", "image", "timeout", 3000);
        recordChannelRuntimeFailure("cancelled", "image", "任务已取消", 3000);
        expect(filterHealthyRuntimeCandidates([{ channelId: "primary" }, { channelId: "backup" }], "image", 4000).map((item) => item.channelId)).toEqual(["backup"]);
        expect(filterHealthyRuntimeCandidates([{ channelId: "primary" }], "image", 4000).map((item) => item.channelId)).toEqual(["primary"]);
        expect(getChannelRuntimeHealth("cancelled", "image").consecutiveFailures).toBe(0);
    });

    it("keeps one retry candidate when every channel is cooling", () => {
        recordChannelRuntimeFailure("primary", "text", "timeout", 1000);
        recordChannelRuntimeFailure("primary", "text", "timeout", 2000);
        recordChannelRuntimeFailure("primary", "text", "timeout", 3000);
        recordChannelRuntimeFailure("backup", "text", "timeout", 4000);
        recordChannelRuntimeFailure("backup", "text", "timeout", 5000);
        recordChannelRuntimeFailure("backup", "text", "timeout", 6000);
        expect(filterHealthyRuntimeCandidates([{ channelId: "primary" }, { channelId: "backup" }], "text", 7000).map((item) => item.channelId)).toEqual(["primary"]);
    });
});
