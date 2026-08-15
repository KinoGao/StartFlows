import { describe, expect, it } from "vitest";

import { groupAdminGenerationChannels, type AdminGenerationChannel } from "./admin-generation-operations";

describe("admin generation channel grouping", () => {
    it("groups logical bindings under capability and channel while prioritizing exceptions", () => {
        const groups = groupAdminGenerationChannels(
            [
                channel({ id: "healthy", name: "稳定渠道", logicalModelId: "image-a", logicalModelName: "图片 A" }),
                channel({ id: "cooling", name: "冷却渠道", logicalModelId: "image-b", logicalModelName: "图片 B", runtimeHealth: { status: "cooling", consecutiveFailures: 2, lastError: "上游失败" } }),
                channel({ id: "healthy", name: "稳定渠道", logicalModelId: "image-c", logicalModelName: "图片 C", upstreamModel: "vendor/image-c" }),
                channel({ id: "disabled", name: "停用渠道", logicalModelId: "image-d", logicalModelName: "图片 D", enabled: false }),
                channel({ id: "anomaly", name: "异常渠道", logicalModelId: "image-e", logicalModelName: "图片 E", runtimeHealth: { status: "healthy", consecutiveFailures: 1, lastError: "最近请求失败" } }),
            ],
            "",
        );

        expect(groups).toHaveLength(1);
        expect(groups[0].channels.map((item) => item.id)).toEqual(["cooling", "disabled", "anomaly", "healthy"]);
        expect(groups[0].channels[3].bindings.map((item) => item.logicalModelId)).toEqual(["image-a", "image-c"]);
    });

    it("searches channel IDs, logical models and upstream models with an exact empty state", () => {
        const channels = [channel({ id: "channel-one", logicalModelId: "video-pro", logicalModelName: "视频旗舰", upstreamModel: "vendor/veo" })];

        expect(groupAdminGenerationChannels(channels, "veo")[0].channels[0].id).toBe("channel-one");
        expect(groupAdminGenerationChannels(channels, "video-pro")[0].channels[0].id).toBe("channel-one");
        expect(groupAdminGenerationChannels(channels, "missing")).toEqual([]);
    });
});

function channel(patch: Partial<AdminGenerationChannel>): AdminGenerationChannel {
    return {
        id: "channel",
        name: "渠道",
        capability: "image",
        logicalModelId: "image",
        logicalModelName: "图片",
        upstreamModel: "vendor/image",
        enabled: true,
        runtimeHealth: { status: "healthy", consecutiveFailures: 0 },
        ...patch,
    };
}
