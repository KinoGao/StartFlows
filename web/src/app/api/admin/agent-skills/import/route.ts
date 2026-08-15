import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { GithubSkillImportError, importAgentSkillFromGithub } from "@/lib/server/github-agent-skill-import";
import { apiCompatError, apiSuccess } from "@/app/api/_shared/api-response";
import { AgentSkillRefinementError, refineImportedAgentSkill } from "@/lib/server/agent-skill-import-refiner";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return apiCompatError(401, "请先登录");
    if (!hasAdminPermission(currentUser, "upstream.manage")) return apiCompatError(403, "需要管理员权限");

    try {
        const body = await readJsonBody<{ url?: unknown; path?: unknown }>(request);
        if (typeof body.url !== "string" || !body.url.trim()) return apiCompatError(400, "请输入 GitHub 地址");
        const imported = await importAgentSkillFromGithub({ url: body.url, path: typeof body.path === "string" ? body.path : undefined });
        const result = imported.skill ? { ...imported, skill: await refineImportedAgentSkill({ skill: imported.skill, requestUrl: request.url, cookie: request.headers.get("cookie") || "", userId: currentUser.id }) } : imported;
        return apiSuccess(result, result.skill ? "Skill 已由默认文本模型提取整理" : "请选择要提取的 Skill");
    } catch (error) {
        if (error instanceof GithubSkillImportError) return apiCompatError(error.status, error.message);
        if (error instanceof AgentSkillRefinementError) return apiCompatError(error.status, error.message);
        console.error("Admin GitHub Skill import failed", error);
        return apiCompatError(500, "提取 GitHub Skill 失败");
    }
}
