import type { LogicalModelCapabilityProfile } from "@/lib/auth/store";

export type CapabilityConstraintInput = {
    capability: "image" | "video" | "audio" | "text";
    referenceCount?: number;
    durationSeconds?: number;
    batchSize?: number;
    aspectRatio?: string;
};

export function assertCapabilityConstraints(profile: LogicalModelCapabilityProfile | undefined, input: CapabilityConstraintInput) {
    if (!profile) return;
    if (input.referenceCount && profile.maxReferenceImages && input.referenceCount > profile.maxReferenceImages) throw new Error(`当前模型最多支持 ${profile.maxReferenceImages} 张参考图`);
    if (input.batchSize && profile.maxBatchSize && input.batchSize > profile.maxBatchSize) throw new Error(`当前模型最多支持批量生成 ${profile.maxBatchSize} 个结果`);
    if (input.durationSeconds && profile.minDurationSeconds && input.durationSeconds < profile.minDurationSeconds) throw new Error(`当前模型最短视频时长为 ${profile.minDurationSeconds} 秒`);
    if (input.durationSeconds && profile.maxDurationSeconds && input.durationSeconds > profile.maxDurationSeconds) throw new Error(`当前模型最长视频时长为 ${profile.maxDurationSeconds} 秒`);
    if (input.aspectRatio && profile.aspectRatios?.length && !profile.aspectRatios.includes(input.aspectRatio)) throw new Error(`当前模型不支持 ${input.aspectRatio} 比例`);
}
