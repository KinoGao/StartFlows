import type { AgentSkillWorkspace } from "@/lib/auth/store-types";

export type AgentSkillSummary = {
    id: string;
    name: string;
    description: string;
    action?: "generate" | "edit";
    requiresReference?: boolean;
    defaultConfig?: Record<string, string | number | boolean>;
    workspaces?: AgentSkillWorkspace[];
};

type ApiResponse<T> = { code: number; data: T; msg: string };

export async function listAgentSkills(workspace: AgentSkillWorkspace | "all" = "all") {
    const response = await fetch(`/api/agent/skills?workspace=${encodeURIComponent(workspace)}`, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as ApiResponse<{ skills: AgentSkillSummary[] }> | null;
    if (!response.ok || !payload || payload.code !== 0) throw new Error(payload?.msg || "获取创作 Skill 失败");
    return payload.data.skills;
}
