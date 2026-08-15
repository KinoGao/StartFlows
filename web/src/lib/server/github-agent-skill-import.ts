import { createHash } from "node:crypto";

import { parseDocument } from "yaml";

import type { AgentSkillWorkspace } from "@/lib/auth/store-types";
import { AGENT_SKILL_EXTRACTION_SOURCE_LENGTH, type AgentSkillImportResult, type ImportedAgentSkill } from "@/lib/agent-skill-import-types";
import { fetchSafeOutbound } from "@/lib/server/safe-outbound-fetch";

const GITHUB_API = "https://api.github.com";
const RAW_GITHUB_ORIGIN = "https://raw.githubusercontent.com";
const MAX_MARKDOWN_LENGTH = 256_000;
const MAX_TREE_LENGTH = 4_000_000;
const MAX_CANDIDATES = 20;
const REQUEST_TIMEOUT_MS = 15_000;
const WORKSPACES: AgentSkillWorkspace[] = ["image", "video", "canvas", "drama"];

type GitHubLocation = {
    owner: string;
    repository: string;
    ref?: string;
    path?: string;
    mode: "repository" | "tree" | "blob";
};

type GitHubRepository = {
    default_branch?: string;
    license?: { spdx_id?: string | null } | null;
};

type GitHubCommit = {
    sha?: string;
};

type GitHubTreeEntry = {
    path?: string;
    type?: string;
};

type SkillFrontmatter = {
    name?: unknown;
    description?: unknown;
    version?: unknown;
    license?: unknown;
    keywords?: unknown;
    workspaces?: unknown;
    action?: unknown;
    requiresReference?: unknown;
    defaultConfig?: unknown;
    metadata?: unknown;
};

export class GithubSkillImportError extends Error {
    status: number;

    constructor(message: string, status = 400) {
        super(message);
        this.name = "GithubSkillImportError";
        this.status = status;
    }
}

export async function importAgentSkillFromGithub(input: { url: string; path?: string }): Promise<AgentSkillImportResult> {
    const location = parseGitHubLocation(input.url);
    const repository = await githubJson<GitHubRepository>(`/repos/${location.owner}/${location.repository}`);
    const requestedRef = location.ref || repository.default_branch || "main";
    const ref = await resolveCommit(location, requestedRef);
    const scope = location.path && location.mode !== "blob" ? trimPath(location.path) : "";

    if (location.mode === "blob") {
        const sourcePath = requireSkillPath(location.path);
        return { repository: `${location.owner}/${location.repository}`, ref, candidates: [], skill: await readSkill(location, ref, sourcePath, repository.license?.spdx_id || undefined) };
    }

    const requestedPath = input.path ? trimPath(input.path) : undefined;
    if (requestedPath) {
        if (!isSkillPath(requestedPath) || (scope && requestedPath !== scope && !requestedPath.startsWith(`${scope}/`))) {
            throw new GithubSkillImportError("所选 Skill 路径不属于当前 GitHub 地址");
        }
        return { repository: `${location.owner}/${location.repository}`, ref, candidates: [], skill: await readSkill(location, ref, requestedPath, repository.license?.spdx_id || undefined) };
    }

    const entries = await githubJson<{ tree?: GitHubTreeEntry[]; truncated?: boolean }>(`/repos/${location.owner}/${location.repository}/git/trees/${encodeURIComponent(ref)}?recursive=1`, MAX_TREE_LENGTH);
    const candidates = (entries.tree || [])
        .filter((entry) => entry.type === "blob" && typeof entry.path === "string" && isSkillPath(entry.path))
        .map((entry) => ({ path: trimPath(entry.path as string), name: skillNameFromPath(entry.path as string) }))
        .filter((entry) => !scope || entry.path === scope || entry.path.startsWith(`${scope}/`))
        .slice(0, MAX_CANDIDATES);

    if (!candidates.length) throw new GithubSkillImportError("这个公开仓库或目录中没有找到 SKILL.md");
    if (candidates.length > 1) return { repository: `${location.owner}/${location.repository}`, ref, candidates };

    return { repository: `${location.owner}/${location.repository}`, ref, candidates: [], skill: await readSkill(location, ref, candidates[0].path, repository.license?.spdx_id || undefined) };
}

export function parseGitHubLocation(value: string): GitHubLocation {
    let url: URL;
    try {
        url = new URL(value.trim());
    } catch {
        throw new GithubSkillImportError("请输入有效的 GitHub 公开地址");
    }
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !["github.com", "www.github.com", "raw.githubusercontent.com"].includes(hostname)) {
        throw new GithubSkillImportError("只支持 github.com 的公开仓库、目录或 SKILL.md 地址");
    }
    let parts: string[];
    try {
        parts = url.pathname
            .split("/")
            .filter(Boolean)
            .map((part) => decodeURIComponent(part));
    } catch {
        throw new GithubSkillImportError("GitHub 地址包含无效路径");
    }
    if (parts.length < 2 || !isGithubSegment(parts[0]) || !isGithubSegment(parts[1])) throw new GithubSkillImportError("GitHub 地址缺少公开仓库信息");
    const owner = parts[0];
    const repository = parts[1].replace(/\.git$/i, "");
    if (!repository) throw new GithubSkillImportError("GitHub 仓库地址无效");

    if (hostname === "raw.githubusercontent.com") {
        if (parts.length < 4) throw new GithubSkillImportError("Raw GitHub 地址缺少分支和 SKILL.md 路径");
        const path = parts.slice(3).join("/");
        if (!isSkillPath(path)) throw new GithubSkillImportError("地址必须指向 SKILL.md");
        return { owner, repository, ref: parts[2], path, mode: "blob" };
    }
    if (!parts[2]) return { owner, repository, mode: "repository" };
    if (parts[2] !== "tree" && parts[2] !== "blob") throw new GithubSkillImportError("请粘贴仓库、tree 目录或 SKILL.md 文件地址");
    if (parts.length < 4) throw new GithubSkillImportError("GitHub 地址缺少分支信息");
    const path = parts.slice(4).join("/");
    if (parts[2] === "blob" && !isSkillPath(path)) throw new GithubSkillImportError("地址必须指向 SKILL.md");
    return { owner, repository, ref: parts[3], path, mode: parts[2] };
}

async function readSkill(location: GitHubLocation, ref: string, sourcePath: string, repositoryLicense?: string): Promise<ImportedAgentSkill> {
    const rawUrl = `${RAW_GITHUB_ORIGIN}/${location.owner}/${location.repository}/${encodePath(ref)}/${encodePath(sourcePath)}`;
    const markdown = await githubText(rawUrl, MAX_MARKDOWN_LENGTH);
    return parseSkillMarkdown(markdown, {
        id: `github-${location.owner}-${location.repository}-${sourcePath
            .replace(/[^a-z0-9]+/gi, "-")
            .replace(/^-|-$/g, "")
            .toLowerCase()}`.slice(0, 120),
        repository: `${location.owner}/${location.repository}`,
        ref,
        sourcePath,
        sourceUrl: `https://github.com/${location.owner}/${location.repository}/blob/${encodePath(ref)}/${encodePath(sourcePath)}`,
        repositoryLicense,
    });
}

function parseSkillMarkdown(markdown: string, source: { id: string; repository: string; ref: string; sourcePath: string; sourceUrl: string; repositoryLicense?: string }): ImportedAgentSkill {
    const normalized = markdown.replace(/^\uFEFF/, "").trim();
    const frontmatter = normalized.startsWith("---") ? readFrontmatter(normalized) : { values: {} as SkillFrontmatter, body: normalized };
    const metadata = isRecord(frontmatter.values.metadata) ? frontmatter.values.metadata : {};
    const name = firstText(frontmatter.values.name, metadata.name) || headingName(frontmatter.body) || skillNameFromPath(source.sourcePath);
    const description = firstText(frontmatter.values.description, metadata.description) || firstParagraph(frontmatter.body) || `来自 ${source.repository} 的 Agent Skill`;
    const instructions = frontmatter.body.trim();
    if (instructions.length < 10) throw new GithubSkillImportError("SKILL.md 内容过短，无法作为执行规则");
    const workspaces = parseWorkspaces(frontmatter.values.workspaces ?? metadata.workspaces);
    const action = firstText(frontmatter.values.action, metadata.action) === "edit" ? "edit" : "generate";
    const keywords = parseKeywords(frontmatter.values.keywords ?? metadata.keywords);
    const defaultConfig = parseDefaultConfig(frontmatter.values.defaultConfig ?? metadata.defaultConfig);
    const license = firstText(frontmatter.values.license, metadata.license, source.repositoryLicense)?.slice(0, 120);

    return {
        id: source.id,
        name: name.slice(0, 60),
        description: description.slice(0, 240),
        plannerSummary: description.slice(0, 240),
        instructions: instructions.slice(0, AGENT_SKILL_EXTRACTION_SOURCE_LENGTH),
        enabled: false,
        keywords: keywords.slice(0, 30),
        workspaces,
        action,
        requiresReference: Boolean(frontmatter.values.requiresReference ?? metadata.requiresReference),
        defaultConfig,
        sourceUrl: source.sourceUrl,
        sourceVersion: source.ref,
        sourceCommit: source.ref,
        sourceContentHash: createHash("sha256").update(markdown, "utf8").digest("hex"),
        ...(license ? { license } : {}),
        repository: source.repository,
        sourcePath: source.sourcePath,
    };
}

async function resolveCommit(location: GitHubLocation, ref: string) {
    const commit = await githubJson<GitHubCommit>(`/repos/${location.owner}/${location.repository}/commits/${encodeURIComponent(ref)}`);
    const sha = commit.sha?.trim().toLowerCase() || "";
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new GithubSkillImportError("GitHub 没有返回可固定的 commit，无法安全导入", 502);
    return sha;
}

function readFrontmatter(markdown: string): { values: SkillFrontmatter; body: string } {
    const end = markdown.indexOf("\n---", 3);
    if (end < 0) return { values: {}, body: markdown };
    const raw = markdown.slice(3, end).trim();
    const body = markdown.slice(end + "\n---".length).replace(/^\r?\n/, "");
    try {
        const values = parseDocument(raw).toJS() as unknown;
        return { values: isRecord(values) ? (values as SkillFrontmatter) : {}, body };
    } catch {
        throw new GithubSkillImportError("SKILL.md 的 YAML 头信息无法解析");
    }
}

async function githubJson<T>(path: string, maxLength = 500_000): Promise<T> {
    return JSON.parse(await githubText(`${GITHUB_API}${path}`, maxLength)) as T;
}

async function githubText(url: string, maxLength: number): Promise<string> {
    let response: Response;
    try {
        response = await fetchSafeOutbound(url, {
            headers: { Accept: "application/vnd.github+json", "User-Agent": "VOZEB-PRO-agent-skill-import" },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            redirect: "error",
            cache: "no-store",
        });
    } catch {
        throw new GithubSkillImportError("GitHub 地址暂时无法访问，请检查服务器网络或稍后重试", 502);
    }
    if (!response.ok) {
        if (response.status === 404) throw new GithubSkillImportError("未找到公开仓库或 SKILL.md，请确认地址可在浏览器直接打开", 404);
        if (response.status === 403) throw new GithubSkillImportError("GitHub 暂时限制了请求，请稍后重试", 429);
        throw new GithubSkillImportError(`GitHub 返回了 ${response.status}，暂时无法提取 Skill`, 502);
    }
    const length = Number(response.headers.get("content-length") || 0);
    if (length > maxLength) throw new GithubSkillImportError("GitHub 文件过大，无法导入");
    const text = await response.text();
    if (text.length > maxLength) throw new GithubSkillImportError("GitHub 文件过大，无法导入");
    return text;
}

function requireSkillPath(path: string | undefined) {
    const value = trimPath(path || "");
    if (!isSkillPath(value)) throw new GithubSkillImportError("地址必须指向 SKILL.md");
    return value;
}

function trimPath(value: string) {
    const path = value.replace(/^\/+|\/+$/g, "");
    if (!path || path.split("/").some((part) => part === "." || part === "..")) throw new GithubSkillImportError("GitHub 路径无效");
    return path;
}

function encodePath(value: string) {
    return value.split("/").map(encodeURIComponent).join("/");
}

function isSkillPath(value: string) {
    return value.split("/").at(-1)?.toLowerCase() === "skill.md";
}

function isGithubSegment(value: string) {
    return /^[a-z0-9_.-]+$/i.test(value);
}

function skillNameFromPath(path: string) {
    const name = path.split("/").at(-2) || path.split("/").at(-1) || "GitHub Skill";
    return name.replace(/[-_]+/g, " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function headingName(body: string) {
    return body.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function firstParagraph(body: string) {
    return body
        .replace(/^#.*$/gm, "")
        .split(/\n\s*\n/)
        .map((item) => item.replace(/[`*_>#-]/g, "").trim())
        .find(Boolean);
}

function firstText(...values: unknown[]) {
    return values.find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim();
}

function parseKeywords(value: unknown) {
    if (Array.isArray(value))
        return value
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean);
    return typeof value === "string"
        ? value
              .split(/[、,，\n]/)
              .map((item) => item.trim())
              .filter(Boolean)
        : [];
}

function parseWorkspaces(value: unknown): AgentSkillWorkspace[] {
    const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[、,，\s]+/) : [];
    const parsed = values.filter((item): item is AgentSkillWorkspace => typeof item === "string" && WORKSPACES.includes(item as AgentSkillWorkspace));
    return parsed.length ? [...new Set(parsed)] : ["image"];
}

function parseDefaultConfig(value: unknown): Record<string, string | number | boolean> {
    if (!isRecord(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, item]) => ["string", "number", "boolean"].includes(typeof item))) as Record<string, string | number | boolean>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
