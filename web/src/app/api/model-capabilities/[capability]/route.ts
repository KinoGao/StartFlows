import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getAuthSettings } from "@/lib/auth/store";
import { resolveLogicalModelCapabilityProfile, resolveLogicalModelConfig } from "@/lib/model-routing-config";
import type { LogicalModelCapability, LogicalModelCapabilityProfile } from "@/lib/auth/store-types";

export const dynamic = "force-dynamic";

const CAPABILITY_LABELS: Record<string, LogicalModelCapability> = {
    image: "image",
    video: "video",
    audio: "audio",
};

const DEFAULT_VIDEO_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"];
const DEFAULT_IMAGE_RATIOS = ["1:1", "3:4", "4:5", "4:3", "16:9", "9:16", "2:3", "3:2"];

export async function GET(request: Request, context: { params: Promise<{ capability: string }> }) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const { capability } = await context.params;
    const kind = CAPABILITY_LABELS[capability];
    if (!kind) return NextResponse.json({ code: 404, data: null, msg: "能力类型不存在" }, { status: 404 });

    const settings = await getAuthSettings();
    const data: Record<string, unknown>[] = [];
    for (const model of settings.logicalModels) {
        if (model.capability !== kind || !model.enabled) continue;
        const resolved = resolveLogicalModelConfig(settings.logicalModels, settings.systemChannels, kind, model.id);
        if (!resolved) continue;
        const { binding, channel } = resolved;
        const profile: LogicalModelCapabilityProfile = resolveLogicalModelCapabilityProfile(binding, kind, channel, binding.upstreamModel) || {};
        const provider = profile.provider || channel.name;
        const requestAdapter = profile.requestAdapter || channel.advancedConfig?.protocol || channel.apiFormat;
        const modelPatterns = profile.modelPatterns?.length ? profile.modelPatterns : [binding.upstreamModel];
        if (kind === "video") {
            // 显式 generationModes 与支持标记（supportsReferenceVideo 等）取并集：
            // 后台常只填两种模式但打开了全能参考等开关，单靠显式列表会把已声明能力吞掉
            const derivedModes = videoModesFromProfile(profile, channel.advancedConfig?.protocol);
            const modes = profile.generationModes?.length ? Array.from(new Set([...profile.generationModes, ...derivedModes])) : derivedModes;
            const durations = profile.durations?.length ? profile.durations : durationRangeFromProfile(profile);
            data.push({
                id: model.id,
                provider,
                requestAdapter,
                modelPatterns,
                modes,
                ratios: profile.aspectRatios?.length ? profile.aspectRatios : DEFAULT_VIDEO_RATIOS,
                resolutions: profile.resolutions?.length ? profile.resolutions : ["720p", "1080p"],
                durations,
                frameRates: profile.frameRates || [],
                counts: profile.counts?.length ? profile.counts : [1],
                generateAudio: profile.generateAudio === true,
                watermark: profile.watermark === true,
                draft: profile.draft === true,
                maxImages: profile.maxReferenceImages ?? defaultVideoMaxReferenceImages(profile, channel.advancedConfig?.protocol),
                maxVideos: profile.maxReferenceVideos || 0,
                maxAudios: profile.maxReferenceAudios || 0,
            });
        } else if (kind === "image") {
            const modes = profile.generationModes?.length ? profile.generationModes : ["text-to-image", "image-to-image"];
            data.push({
                id: model.id,
                provider,
                requestAdapter,
                modelPatterns,
                modes,
                qualities: profile.qualities?.length ? profile.qualities : ["standard"],
                resolutions: profile.resolutions?.length ? profile.resolutions : ["1k", "2k"],
                ratios: profile.aspectRatios?.length ? profile.aspectRatios : DEFAULT_IMAGE_RATIOS,
                counts: profile.counts?.length ? profile.counts : [1],
                maxImages: profile.maxOutputs || 1,
                maxOutputs: profile.maxOutputs || 1,
                maxTotalImages: profile.maxTotalImages || profile.maxOutputs || 1,
                sequentialImageGeneration: profile.sequentialImageGeneration === true,
                interactiveEdit: profile.interactiveEdit === true,
                watermark: profile.watermark === true,
                documentationUrl: profile.documentationUrl || "",
                officialTemplate: profile.officialTemplate || "",
            });
        } else {
            data.push({
                id: model.id,
                provider,
                requestAdapter,
                modelPatterns,
                modes: profile.generationModes?.length ? profile.generationModes : ["text-to-speech"],
                voices: profile.voices?.length ? profile.voices : ["alloy"],
                formats: profile.formats?.length ? profile.formats : ["mp3"],
                speeds: profile.speeds?.length ? profile.speeds : [1],
                instructions: profile.instructions === true,
            });
        }
    }
    return NextResponse.json({ code: 0, data, msg: "OK" });
}

function videoModesFromProfile(profile: LogicalModelCapabilityProfile, protocol: string | undefined) {
    const modes: string[] = ["text-to-video"];
    if (profile.supportsReferenceImage) modes.push("image-to-video");
    if (profile.supportsReferenceVideo) modes.push("all-in-one-reference");
    if (profile.supportsReferenceImage && protocol === "volcengine-video") modes.push("first-last-frame");
    return modes;
}

// 未配置参考图上限时，按实际适配器能力派生：multipart 单参考图取 1，
// 火山方舟 JSON 协议首尾帧需要 2 张；不声明参考图能力时为 0。
function defaultVideoMaxReferenceImages(profile: LogicalModelCapabilityProfile, protocol: string | undefined) {
    if (!profile.supportsReferenceImage) return 0;
    return protocol === "volcengine-video" ? 2 : 1;
}

function durationRangeFromProfile(profile: LogicalModelCapabilityProfile) {
    const min = profile.minDurationSeconds || 5;
    const max = profile.maxDurationSeconds || min;
    const candidates = [5, 6, 8, 10, 12, 15].filter((value) => value >= min && value <= max);
    return candidates.length ? candidates : [min];
}
