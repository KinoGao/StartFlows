import { describe, expect, it } from "vitest";

import type { SystemChannelAdvancedConfig, SystemModelChannel } from "@/lib/auth/store";
import { parseChannelExampleConfig } from "./channel-example-parser";

const advanced: SystemChannelAdvancedConfig = {
    protocol: "auto",
    textModel: "",
    imageModel: "",
    videoModel: "",
    createPath: "",
    editPath: "",
    imageToVideoPath: "",
    queryPath: "",
    requestTemplate: "",
    resultField: "",
    statusField: "",
    durationRange: "",
    referenceRule: "",
    supportsReferenceImage: false,
    supportsReferenceVideo: false,
    supportsReferenceAudio: false,
};

describe("parseChannelExampleConfig", () => {
    it("keeps non-standard video examples in the generic compatible protocol", () => {
        const channel = { id: "one", name: "测试", baseUrl: "", apiKey: "", apiFormat: "openai", models: [], enabled: false } satisfies SystemModelChannel;
        const result = parseChannelExampleConfig('curl https://api.example.com/v1/video/generations -d {"model":"video-v1","prompt":"test","duration":5}', channel, advanced);
        expect(result?.patch.advancedConfig?.protocol).toBe("compatible");
        expect(result?.patch.advancedConfig?.createPath).toBe("/video/generations");
    });

    it("stores text-to-image and image-to-image paths independently", () => {
        const channel = { id: "one", name: "测试", baseUrl: "", apiKey: "", apiFormat: "openai", models: [], enabled: false } satisfies SystemModelChannel;
        const generation = parseChannelExampleConfig('curl https://api.example.com/v1/images/generations -d {"model":"image-v1","prompt":"test"}', channel, advanced);
        const edit = parseChannelExampleConfig('curl https://api.example.com/v1/images/edits -d {"model":"image-v1","prompt":"test","image":"https://cdn.example.com/ref.png"}', channel, generation?.patch.advancedConfig || advanced);
        expect(edit?.patch.advancedConfig).toMatchObject({ createPath: "/images/generations", editPath: "/images/edits" });
    });

    it("stores a reference-image video endpoint as the image-to-video path", () => {
        const channel = { id: "one", name: "测试", baseUrl: "", apiKey: "", apiFormat: "openai", models: [], enabled: false } satisfies SystemModelChannel;
        const result = parseChannelExampleConfig('curl https://api.example.com/v1/video/generations -d {"model":"video-v1","prompt":"test","image":"https://cdn.example.com/ref.png"}', channel, advanced);
        expect(result?.patch.advancedConfig).toMatchObject({ imageToVideoPath: "/video/generations", queryPath: "/video/generations/:task_id" });
    });

    it.each([
        ["https://api.code2alita.com/v1/video/generations", "sub2api"],
        ["https://api.globalaiopc.com/v1/video/generations", "custom"],
        ["https://ark.cn-beijing.volces.com/api/v3/video/generations", "volcengine-video"],
    ])("recognizes the exact provider host in %s", (url, protocol) => {
        const channel = { id: "one", name: "测试", baseUrl: "", apiKey: "", apiFormat: "openai", models: [], enabled: false } satisfies SystemModelChannel;
        const result = parseChannelExampleConfig(`curl ${url} -d {"model":"video-v1","prompt":"test"}`, channel, advanced);
        expect(result?.patch.advancedConfig?.protocol).toBe(protocol);
    });

    it.each(["code2alita.com.evil.test", "globalaiopc.com.evil.test", "ark.cn-beijing.volces.com.evil.test"])("does not trust a provider name embedded in %s", (hostname) => {
        const channel = { id: "one", name: "测试", baseUrl: "", apiKey: "", apiFormat: "openai", models: [], enabled: false } satisfies SystemModelChannel;
        const result = parseChannelExampleConfig(`curl https://${hostname}/v1/video/generations -d {"model":"video-v1","prompt":"test"}`, channel, advanced);
        expect(result?.patch.advancedConfig?.protocol).toBe("compatible");
    });

    it.each([
        ['{"model":"seedream_5.0Pro","prompt":"test","resolution":"2K"}', "seedream_5.0Pro"],
        ['{"model":"seedance-2.5","prompt":"test","duration":5}', "seedance-2.5"],
    ])("recognizes a Yumeng v2 model-center example", (body, model) => {
        const channel = { id: "one", name: "测试", baseUrl: "", apiKey: "", apiFormat: "openai", models: [], enabled: false } satisfies SystemModelChannel;
        const result = parseChannelExampleConfig(`curl https://zcbservice.aizfw.cn/kyyReactApiServer/v2/model-center/tasks -d '${body}'`, channel, advanced);

        expect(result?.patch.advancedConfig?.protocol).toBe("yumeng");
        expect(result?.patch.baseUrl).toBeUndefined();
        expect(result?.patch.advancedConfig?.createPath).toBe("/kyyReactApiServer/v2/model-center/tasks");
        expect(result?.patch.models).toContain(model);
    });
});
