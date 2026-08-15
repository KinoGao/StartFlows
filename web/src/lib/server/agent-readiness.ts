import type { AuthSettings } from "@/lib/auth/store";
import { resolveLogicalModel } from "./logical-model-router";

type AgentReadiness = {
    ready: boolean;
    capabilities: Array<{ type: "text" | "image" | "video" | "audio"; model: string; channelId?: string; ready: boolean; message: string }>;
    skills: Record<"image" | "video" | "canvas" | "drama", number>;
    defaults: AuthSettings["generationDefaults"];
    concurrency: AuthSettings["generationConcurrency"];
};

export function buildAgentReadiness(settings: AuthSettings): AgentReadiness {
    const models = { text: settings.defaultModels.textModel, image: settings.defaultModels.imageModel, video: settings.defaultModels.videoModel, audio: settings.defaultModels.audioModel };
    const capabilities = (Object.entries(models) as Array<[keyof typeof models, string]>).map(([type, model]) => {
        const resolved = resolveLogicalModel(settings, type, model);
        return { type, model, channelId: resolved?.channelId, ready: Boolean(model && resolved), message: !model ? "未设置默认模型" : !resolved ? "默认模型没有可用渠道绑定" : `使用渠道：${resolved.channel.name}` };
    });
    const skills = { image: 0, video: 0, canvas: 0, drama: 0 };
    for (const skill of settings.agentSkills) if (skill.enabled) for (const workspace of skill.workspaces || ["image"]) skills[workspace] += 1;
    return { ready: capabilities.every((item) => item.ready), capabilities, skills, defaults: settings.generationDefaults, concurrency: settings.generationConcurrency };
}
