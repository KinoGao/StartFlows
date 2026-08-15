import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), importAgentSkillFromGithub: vi.fn(), refineImportedAgentSkill: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/github-agent-skill-import", () => ({
    GithubSkillImportError: class GithubSkillImportError extends Error {
        status = 400;
    },
    importAgentSkillFromGithub: mocks.importAgentSkillFromGithub,
}));
vi.mock("@/lib/server/agent-skill-import-refiner", () => ({
    AgentSkillRefinementError: class AgentSkillRefinementError extends Error {
        status = 502;
    },
    refineImportedAgentSkill: mocks.refineImportedAgentSkill,
}));

import { POST } from "./route";

describe("POST /api/admin/agent-skills/import", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", status: "active", adminPermissions: ["upstream.manage"] });
        mocks.refineImportedAgentSkill.mockImplementation(async ({ skill }: { skill: unknown }) => skill);
    });

    it("passes the public URL and selected path to the server importer", async () => {
        mocks.importAgentSkillFromGithub.mockResolvedValue({ repository: "acme/skills", ref: "main", candidates: [], skill: { id: "skill", name: "Skill" } });
        const response = await POST(request({ url: "https://github.com/acme/skills", path: "poster/SKILL.md" }));

        expect(response.status).toBe(200);
        expect(mocks.importAgentSkillFromGithub).toHaveBeenCalledWith({ url: "https://github.com/acme/skills", path: "poster/SKILL.md" });
        expect(mocks.refineImportedAgentSkill).toHaveBeenCalledWith(expect.objectContaining({ requestUrl: "http://localhost/api/admin/agent-skills/import", cookie: "", userId: "admin" }));
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { repository: "acme/skills" } });
    });

    it("does not call the text model before a repository candidate is selected", async () => {
        mocks.importAgentSkillFromGithub.mockResolvedValue({ repository: "acme/skills", ref: "main", candidates: [{ path: "one/SKILL.md", name: "One" }] });

        const response = await POST(request({ url: "https://github.com/acme/skills" }));

        expect(response.status).toBe(200);
        expect(mocks.refineImportedAgentSkill).not.toHaveBeenCalled();
    });

    it("rejects an empty URL before reaching the importer", async () => {
        const response = await POST(request({ url: " " }));

        expect(response.status).toBe(400);
        expect(mocks.importAgentSkillFromGithub).not.toHaveBeenCalled();
    });

    it("rejects non-admin users", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "user", role: "user" });

        const response = await POST(request({ url: "https://github.com/acme/skills" }));

        expect(response.status).toBe(403);
        expect(mocks.importAgentSkillFromGithub).not.toHaveBeenCalled();
    });
});

function request(body: unknown) {
    return new Request("http://localhost/api/admin/agent-skills/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
