import type { AgentSkillImportResult } from "@/lib/agent-skill-import-types";

export type { AgentSkillImportCandidate, AgentSkillImportResult, ImportedAgentSkill } from "@/lib/agent-skill-import-types";

export async function importAgentSkillFromGithub(input: { url: string; path?: string }): Promise<AgentSkillImportResult> {
    const response = await fetch("/api/admin/agent-skills/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as { data?: AgentSkillImportResult; error?: string } | null;
    if (!response.ok || !payload?.data) throw new Error(payload?.error || "AI 提取 GitHub Skill 失败");
    return payload.data;
}
