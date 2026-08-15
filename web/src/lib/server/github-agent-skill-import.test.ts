import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/safe-outbound-fetch", () => ({ fetchSafeOutbound: (url: string | URL, init?: RequestInit) => fetch(url, init) }));

import { GithubSkillImportError, importAgentSkillFromGithub, parseGitHubLocation } from "./github-agent-skill-import";

const markdown = `---
name: 电商海报 Skill
description: 用于商品海报与活动视觉规划
keywords: [商品, 海报]
workspaces: [image, canvas]
license: MIT
---

# 执行规则

先识别商品卖点，再规划主体、构图、光线和画幅。`;
const commit = "0123456789abcdef0123456789abcdef01234567";

describe("github agent skill import", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("imports a single SKILL.md from a public repository", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: string | URL) => {
                const url = String(input);
                if (url.endsWith("/repos/acme/skills")) return response({ default_branch: "main", license: { spdx_id: "MIT" } });
                if (url.endsWith("/repos/acme/skills/commits/main")) return response({ sha: commit });
                if (url.includes(`/git/trees/${commit}?recursive=1`)) return response({ tree: [{ type: "blob", path: "poster/SKILL.md" }] });
                if (url.includes(`raw.githubusercontent.com/acme/skills/${commit}/poster/SKILL.md`)) return response(markdown);
                return response({ message: "not found" }, 404);
            }),
        );

        const result = await importAgentSkillFromGithub({ url: "https://github.com/acme/skills" });

        expect(result.candidates).toEqual([]);
        expect(result.skill).toMatchObject({
            name: "电商海报 Skill",
            description: "用于商品海报与活动视觉规划",
            keywords: ["商品", "海报"],
            workspaces: ["image", "canvas"],
            sourcePath: "poster/SKILL.md",
            sourceCommit: commit,
            license: "MIT",
            enabled: false,
        });
        expect(result.ref).toBe(commit);
        expect(result.skill?.sourceUrl).toContain(`/blob/${commit}/poster/SKILL.md`);
        expect(result.skill?.sourceContentHash).toMatch(/^[a-f0-9]{64}$/);
        expect(result.skill?.instructions).toContain("识别商品卖点");
    });

    it("keeps a bounded long source document for text-model extraction", async () => {
        const longMarkdown = `${markdown}\n${"专业创作规则。".repeat(5_000)}`;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: string | URL) => {
                const url = String(input);
                if (url.endsWith("/repos/acme/skills")) return response({ default_branch: "main" });
                if (url.endsWith("/repos/acme/skills/commits/main")) return response({ sha: commit });
                if (url.includes(`/git/trees/${commit}?recursive=1`)) return response({ tree: [{ type: "blob", path: "poster/SKILL.md" }] });
                if (url.includes(`raw.githubusercontent.com/acme/skills/${commit}/poster/SKILL.md`)) return response(longMarkdown);
                return response({ message: "not found" }, 404);
            }),
        );

        const result = await importAgentSkillFromGithub({ url: "https://github.com/acme/skills" });

        expect(result.skill?.instructions.length).toBe(24_000);
        expect(result.skill?.instructions.length).toBeGreaterThan(8_000);
    });

    it("returns bounded candidates before reading a multi-skill repository", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: string | URL) => {
                const url = String(input);
                if (url.endsWith("/repos/acme/library")) return response({ default_branch: "main", license: { spdx_id: "MIT" } });
                if (url.endsWith("/repos/acme/library/commits/main")) return response({ sha: commit });
                if (url.includes(`/git/trees/${commit}?recursive=1`)) {
                    return response({
                        tree: [
                            { type: "blob", path: "one/SKILL.md" },
                            { type: "blob", path: "two/SKILL.md" },
                            { type: "blob", path: "two/not-SKILL.md" },
                        ],
                    });
                }
                return response({ message: "not found" }, 404);
            }),
        );

        const result = await importAgentSkillFromGithub({ url: "https://github.com/acme/library/tree/main" });

        expect(result.skill).toBeUndefined();
        expect(result.candidates).toEqual([
            { path: "one/SKILL.md", name: "One" },
            { path: "two/SKILL.md", name: "Two" },
        ]);
    });

    it("reads a selected skill under a public tree URL", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: string | URL) => {
                const url = String(input);
                if (url.endsWith("/repos/acme/library")) return response({ default_branch: "main", license: { spdx_id: "MIT" } });
                if (url.endsWith("/repos/acme/library/commits/main")) return response({ sha: commit });
                if (url.includes(`raw.githubusercontent.com/acme/library/${commit}/two/SKILL.md`)) return response(markdown);
                return response({ message: "not found" }, 404);
            }),
        );

        const result = await importAgentSkillFromGithub({ url: "https://github.com/acme/library/tree/main", path: "two/SKILL.md" });

        expect(result.skill?.sourcePath).toBe("two/SKILL.md");
        expect(result.skill?.sourceCommit).toBe(commit);
    });

    it("imports a pinned public Skill without requiring a license declaration", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: string | URL) => {
                const url = String(input);
                if (url.endsWith("/repos/acme/unlicensed")) return response({ default_branch: "main" });
                if (url.endsWith("/repos/acme/unlicensed/commits/main")) return response({ sha: commit });
                if (url.includes(`/git/trees/${commit}?recursive=1`)) return response({ tree: [{ type: "blob", path: "poster/SKILL.md" }] });
                if (url.includes(`raw.githubusercontent.com/acme/unlicensed/${commit}/poster/SKILL.md`)) return response(markdown.replace("license: MIT\n", ""));
                return response({ message: "not found" }, 404);
            }),
        );

        const result = await importAgentSkillFromGithub({ url: "https://github.com/acme/unlicensed" });

        expect(result.skill).toMatchObject({ sourceCommit: commit, enabled: false });
        expect(result.skill?.license).toBeUndefined();
    });

    it("rejects non-GitHub and non-SKILL.md input", () => {
        expect(() => parseGitHubLocation("https://example.com/acme/skills")).toThrow(GithubSkillImportError);
        expect(() => parseGitHubLocation("https://github.com/acme/skills/blob/main/README.md")).toThrow("SKILL.md");
    });
});

function response(body: unknown, status = 200) {
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
