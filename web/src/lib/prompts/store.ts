import { randomUUID } from "node:crypto";

import { AuthInputError } from "@/lib/auth/store";
import { createPostgresRepositories, ensurePostgresSchema, isPostgresDatabaseEnabled, withPostgresTransaction, type QueryExecutor } from "@/lib/server/database";
import type { PromptRecord } from "@/lib/server/database/repository-types";
import { readJsonDataFile, writeJsonDataFile } from "@/lib/server/data-adapter";

type PromptScope = "library" | "user";

type StoredPrompt = {
    id: string;
    scope: PromptScope;
    ownerUserId?: string;
    title: string;
    coverUrl: string;
    prompt: string;
    tags: string[];
    category: string;
    preview: string;
    githubUrl?: string;
    source?: string;
    createdAt: string;
    updatedAt: string;
};

export type PromptInput = {
    title?: string;
    coverUrl?: string;
    prompt?: string;
    tags?: string[] | string;
    category?: string;
    preview?: string;
};

export type PromptDatabase = {
    version: 1;
    prompts: StoredPrompt[];
    seedSources: string[];
};

type BuiltInPromptSeed = {
    id: string;
    title: string;
    coverUrl: string;
    prompt: string;
    tags: string[];
    category: string;
    preview: string;
    githubUrl: string;
};

type PromptListOptions = {
    scope: PromptScope;
    ownerUserId?: string;
    keyword?: string;
    tags?: string[];
    category?: string;
    random?: boolean;
    page?: number;
    pageSize?: number;
    includeFacets?: boolean;
};

const PROMPT_DATA_FILE = "prompts.json";
const DEFAULT_COVER_URL = "";
const LEGACY_PROMPT_SEED_SOURCE_PREFIX = "vozeb-pro/original-author-prompts";
const AWESOME_PROMPT_SEED_SOURCE_PREFIX = "tigerowo/awesome-gpt-image-2-prompts";
const AWESOME_PROMPT_SEED_SOURCE = `${AWESOME_PROMPT_SEED_SOURCE_PREFIX}:60e9c65baecfd6d6d51ac4e4d87f146af834bb64:v3`;
const MANAGED_PROMPT_SEED_SOURCE_PREFIXES = [LEGACY_PROMPT_SEED_SOURCE_PREFIX, AWESOME_PROMPT_SEED_SOURCE_PREFIX];
let mutationQueue = Promise.resolve();

export async function listPrompts(options: PromptListOptions) {
    if (isPostgresDatabaseEnabled()) return listPostgresPrompts(options);

    const db = await readPromptDb({ includeSeeds: true });
    const keyword = (options.keyword || "").trim().toLowerCase();
    const tags = options.tags || [];
    const category = options.category || "";
    const includeFacets = options.includeFacets !== false;
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.max(1, Math.min(100, options.pageSize || 20));
    const base = db.prompts
        .filter((item) => item.scope === options.scope)
        .filter((item) => (options.scope === "user" ? item.ownerUserId === options.ownerUserId : true))
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const withoutTagFilter = includeFacets ? filterPrompts(base, { keyword, category, tags: [] }) : [];
    const filtered = options.random ? shufflePrompts(filterPrompts(base, { keyword, category, tags })) : filterPrompts(base, { keyword, category, tags });

    return {
        items: filtered.slice((page - 1) * pageSize, page * pageSize),
        tags: includeFacets ? collectTags(withoutTagFilter) : [],
        categories: includeFacets ? collectCategories(base) : [],
        total: filtered.length,
        ...(includeFacets ? { scopeTotal: base.length } : {}),
    };
}

function shufflePrompts(items: StoredPrompt[]) {
    const next = [...items];
    for (let index = next.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
    }
    return next;
}

export async function countAllLibraryPrompts() {
    if (isPostgresDatabaseEnabled()) {
        await ensurePostgresPromptSeeds();
        return (await createPostgresRepositories().prompts.facets({ scope: "library" })).scopeTotal;
    }
    const db = await readPromptDb({ includeSeeds: true });
    return db.prompts.filter((item) => item.scope === "library").length;
}

export async function createPrompt(scope: PromptScope, input: PromptInput, ownerUserId?: string) {
    if (isPostgresDatabaseEnabled()) {
        await ensurePostgresSchema();
        const now = new Date().toISOString();
        const normalized = normalizePromptInput(input);
        const item: StoredPrompt = {
            id: randomUUID(),
            scope,
            ownerUserId: scope === "user" ? ownerUserId : undefined,
            ...normalized,
            createdAt: now,
            updatedAt: now,
        };
        return toStoredPrompt(await createPostgresRepositories().prompts.upsert(toPromptRecord(item)));
    }

    return mutatePromptDb((db) => {
        const now = new Date().toISOString();
        const prompt = normalizePromptInput(input);
        const item: StoredPrompt = {
            id: randomUUID(),
            scope,
            ownerUserId: scope === "user" ? ownerUserId : undefined,
            title: prompt.title,
            coverUrl: prompt.coverUrl,
            prompt: prompt.prompt,
            tags: prompt.tags,
            category: prompt.category,
            preview: prompt.preview,
            createdAt: now,
            updatedAt: now,
        };
        db.prompts.push(item);
        return item;
    });
}

export async function updatePrompt(id: string, input: PromptInput, options: { scope: PromptScope; ownerUserId?: string }) {
    if (isPostgresDatabaseEnabled()) {
        await ensurePostgresSchema();
        const repository = createPostgresRepositories().prompts;
        const item = await repository.getById(id);
        if (!item || !matchesPromptScope(item, options)) throw new AuthInputError("提示词不存在");
        const normalized = normalizePromptInput({ ...promptInputFromRecord(item), ...input });
        return toStoredPrompt(
            await repository.upsert(
                toPromptRecord({
                    ...item,
                    ...normalized,
                    updatedAt: new Date().toISOString(),
                }),
            ),
        );
    }

    return mutatePromptDb((db) => {
        const item = db.prompts.find((prompt) => prompt.id === id && prompt.scope === options.scope && (options.scope === "library" || prompt.ownerUserId === options.ownerUserId));
        if (!item) throw new AuthInputError("提示词不存在");
        const next = normalizePromptInput({ ...item, ...input });
        item.title = next.title;
        item.coverUrl = next.coverUrl;
        item.prompt = next.prompt;
        item.tags = next.tags;
        item.category = next.category;
        item.preview = next.preview;
        item.updatedAt = new Date().toISOString();
        return item;
    });
}

export async function deletePrompt(id: string, options: { scope: PromptScope; ownerUserId?: string }) {
    if (isPostgresDatabaseEnabled()) {
        await ensurePostgresSchema();
        const repository = createPostgresRepositories().prompts;
        const item = await repository.getById(id);
        if (!item || !matchesPromptScope(item, options) || !(await repository.delete(id))) throw new AuthInputError("提示词不存在");
        return { ok: true };
    }

    return mutatePromptDb((db) => {
        const before = db.prompts.length;
        db.prompts = db.prompts.filter((prompt) => !(prompt.id === id && prompt.scope === options.scope && (options.scope === "library" || prompt.ownerUserId === options.ownerUserId)));
        if (db.prompts.length === before) throw new AuthInputError("提示词不存在");
        return { ok: true };
    });
}

function filterPrompts(items: StoredPrompt[], options: { keyword: string; category: string; tags: string[] }) {
    return items.filter((item) => {
        if (isActiveOption(options.category) && item.category !== options.category) return false;
        if (options.tags.length && !options.tags.some((tag) => item.tags.includes(tag))) return false;
        if (!options.keyword) return true;
        return [item.title, item.prompt, item.category, ...item.tags].join(" ").toLowerCase().includes(options.keyword);
    });
}

function normalizePromptInput(input: PromptInput) {
    const title = repairMojibakeText(input.title || "").trim();
    const prompt = repairMojibakeText(input.prompt || "").trim();
    if (!title) throw new AuthInputError("请输入标题");
    if (!prompt) throw new AuthInputError("请输入提示词内容");
    return {
        title: title.slice(0, 120),
        coverUrl: (input.coverUrl || DEFAULT_COVER_URL).trim(),
        prompt,
        tags: normalizeTags(input.tags),
        category:
            repairMojibakeText(input.category || "默认")
                .trim()
                .slice(0, 40) || "默认",
        preview: repairMojibakeText(input.preview || "").trim(),
    };
}

function normalizeTags(value: PromptInput["tags"]) {
    const raw = Array.isArray(value) ? value : String(value || "").split(/[,，\n]/);
    return Array.from(new Set(raw.map((tag) => repairMojibakeText(tag).trim().toLowerCase()).filter(Boolean))).slice(0, 12);
}

async function readPromptDb({ includeSeeds }: { includeSeeds: boolean }): Promise<PromptDatabase> {
    if (isPostgresDatabaseEnabled()) throw new Error("PostgreSQL prompt reads must use scoped repositories");
    const db = await readJsonDataFile<Partial<PromptDatabase>>(PROMPT_DATA_FILE, emptyPromptDb());
    const normalized: PromptDatabase = {
        version: 1,
        prompts: Array.isArray(db.prompts) ? db.prompts.map(normalizeStoredPrompt).filter(Boolean) : [],
        seedSources: Array.isArray(db.seedSources) ? db.seedSources.filter(Boolean) : [],
    };
    return includeSeeds ? ensureBuiltInPromptLibrary(normalized) : normalized;
}

async function ensureBuiltInPromptLibrary(db: PromptDatabase) {
    const hasCurrentSeed = db.seedSources.includes(AWESOME_PROMPT_SEED_SOURCE);
    const hasLegacySeed = [...db.seedSources, ...db.prompts.map((item) => item.source || "")].some(isManagedPromptSeedSourceExceptCurrent);
    if (hasCurrentSeed && !hasLegacySeed) return db;
    const seeds = (await import("@/lib/prompts/original-author-seeds.json")).default as BuiltInPromptSeed[];
    if (!seeds.length) return db;
    const now = new Date().toISOString();
    db.prompts = db.prompts.filter((item) => !isManagedPromptSeedSource(item.source));
    db.seedSources = db.seedSources.filter((source) => !isManagedPromptSeedSource(source));
    const existingIds = new Set(db.prompts.map((item) => item.id));
    const seededPrompts = buildBuiltInPromptLibrary(seeds, now).filter((item) => !existingIds.has(item.id));
    db.prompts.push(...seededPrompts);
    db.seedSources = Array.from(new Set([...db.seedSources, AWESOME_PROMPT_SEED_SOURCE]));
    await writePromptDb(db);
    return db;
}

async function ensurePostgresPromptSeeds() {
    await ensurePostgresSchema();
    const repository = createPostgresRepositories().prompts;
    if (await repository.hasSeedSource(AWESOME_PROMPT_SEED_SOURCE)) return;
    const seeds = (await import("@/lib/prompts/original-author-seeds.json")).default as BuiltInPromptSeed[];
    if (!seeds.length) return;
    const now = new Date().toISOString();
    const prompts = buildBuiltInPromptLibrary(seeds, now).map(toPromptRecord);
    await withPostgresTransaction(async (client) => {
        await createPostgresRepositories(client).prompts.replaceSeededPrompts(MANAGED_PROMPT_SEED_SOURCE_PREFIXES, AWESOME_PROMPT_SEED_SOURCE, prompts);
    });
}

function buildBuiltInPromptLibrary(seeds: BuiltInPromptSeed[], now: string): StoredPrompt[] {
    return seeds.map((seed) => ({
        id: seed.id,
        scope: "library",
        title: seed.title,
        coverUrl: seed.coverUrl,
        prompt: seed.prompt,
        tags: normalizeTags(seed.tags),
        category: seed.category,
        preview: seed.preview,
        githubUrl: seed.githubUrl,
        source: AWESOME_PROMPT_SEED_SOURCE,
        createdAt: now,
        updatedAt: now,
    }));
}

async function listPostgresPrompts(options: PromptListOptions) {
    await ensurePostgresPromptSeeds();
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.max(1, Math.min(100, options.pageSize || 20));
    const repository = createPostgresRepositories().prompts;
    const resultPromise = repository.list({ ...options, page, pageSize });
    const facetsPromise = options.includeFacets === false ? undefined : repository.facets({ scope: options.scope, ownerUserId: options.ownerUserId, keyword: options.keyword, category: options.category });
    const [result, facets] = await Promise.all([resultPromise, facetsPromise]);
    return {
        items: result.items.map(toStoredPrompt),
        tags: facets?.tags.filter(isUsefulPromptTag) || [],
        categories: facets?.categories || [],
        total: result.total,
        ...(facets ? { scopeTotal: facets.scopeTotal } : {}),
    };
}

function matchesPromptScope(prompt: PromptRecord, options: { scope: PromptScope; ownerUserId?: string }) {
    return prompt.scope === options.scope && (options.scope === "library" || prompt.ownerUserId === options.ownerUserId);
}

function promptInputFromRecord(prompt: PromptRecord): PromptInput {
    return {
        title: prompt.title,
        coverUrl: prompt.coverUrl,
        prompt: prompt.prompt,
        tags: Array.isArray(prompt.tags) ? prompt.tags.filter((tag): tag is string => typeof tag === "string") : [],
        category: prompt.category,
        preview: prompt.preview,
    };
}

function toPromptRecord(prompt: StoredPrompt): PromptRecord {
    return {
        id: prompt.id,
        scope: prompt.scope,
        ownerUserId: prompt.ownerUserId,
        title: prompt.title,
        coverUrl: prompt.coverUrl,
        prompt: prompt.prompt,
        tags: prompt.tags,
        category: prompt.category,
        preview: prompt.preview,
        githubUrl: prompt.githubUrl,
        source: prompt.source,
        createdAt: prompt.createdAt,
        updatedAt: prompt.updatedAt,
    };
}

function toStoredPrompt(prompt: PromptRecord): StoredPrompt {
    return normalizeStoredPrompt({
        id: prompt.id,
        scope: prompt.scope,
        ownerUserId: prompt.ownerUserId,
        title: prompt.title,
        coverUrl: prompt.coverUrl,
        prompt: prompt.prompt,
        tags: Array.isArray(prompt.tags) ? prompt.tags.filter((tag): tag is string => typeof tag === "string") : [],
        category: prompt.category,
        preview: prompt.preview,
        githubUrl: prompt.githubUrl,
        source: prompt.source,
        createdAt: prompt.createdAt,
        updatedAt: prompt.updatedAt,
    });
}

async function mutatePromptDb<T>(mutator: (db: PromptDatabase) => T | Promise<T>) {
    const run = mutationQueue.then(async () => {
        const db = await readPromptDb({ includeSeeds: false });
        const result = await mutator(db);
        await writePromptDb(db);
        return result;
    });
    mutationQueue = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
}

async function writePromptDb(db: PromptDatabase) {
    if (isPostgresDatabaseEnabled()) throw new Error("Full PostgreSQL prompt writes are reserved for explicit backup restore");
    await writeJsonDataFile(PROMPT_DATA_FILE, db);
}

export function readPromptBackup() {
    return readPromptDb({ includeSeeds: false });
}

export function writePromptBackup(db: PromptDatabase) {
    return writePromptDb(db);
}

/** Full prompt snapshot for the explicit administrator backup transaction only. */
export async function readPostgresPromptDb(executor: QueryExecutor): Promise<PromptDatabase> {
    const query: QueryExecutor["query"] = executor.query.bind(executor);
    const [promptResult, seedResult] = await Promise.all([query("SELECT * FROM prompts ORDER BY updated_at DESC"), query("SELECT source FROM prompt_seed_sources ORDER BY imported_at ASC")]);
    return {
        version: 1,
        prompts: promptResult.rows.map(mapPostgresPrompt).map(normalizeStoredPrompt).filter(Boolean),
        seedSources: seedResult.rows.map((row) => dbText(row.source)).filter(Boolean),
    };
}

export async function writePostgresPromptDbWithExecutor(db: PromptDatabase, client: QueryExecutor) {
    const normalized = {
        prompts: Array.isArray(db.prompts) ? db.prompts.map(normalizeStoredPrompt).filter(Boolean) : [],
        seedSources: Array.isArray(db.seedSources) ? db.seedSources.filter(Boolean) : [],
    };
    const userResult = await client.query("SELECT id FROM users");
    const userIds = new Set(userResult.rows.map((row) => dbText(row.id)));
    await client.query("DELETE FROM prompts");
    await client.query("DELETE FROM prompt_seed_sources");
    await insertPostgresPromptSeedSources(client, normalized.seedSources);
    await insertPostgresPrompts(
        client,
        normalized.prompts.filter((prompt) => prompt.scope !== "user" || Boolean(prompt.ownerUserId && userIds.has(prompt.ownerUserId))),
    );
}

export async function upsertPostgresPromptDbWithExecutor(db: PromptDatabase, client: QueryExecutor) {
    const normalized = {
        prompts: Array.isArray(db.prompts) ? db.prompts.map(normalizeStoredPrompt).filter(Boolean) : [],
        seedSources: Array.isArray(db.seedSources) ? db.seedSources.filter(Boolean) : [],
    };
    const userResult = await client.query("SELECT id FROM users");
    const userIds = new Set(userResult.rows.map((row) => dbText(row.id)));
    await insertPostgresPromptSeedSources(client, normalized.seedSources);
    await insertPostgresPrompts(
        client,
        normalized.prompts.filter((prompt) => prompt.scope !== "user" || Boolean(prompt.ownerUserId && userIds.has(prompt.ownerUserId))),
    );
}

async function insertPostgresPromptSeedSources(db: QueryExecutor, seedSources: string[]) {
    for (const source of Array.from(new Set(seedSources))) {
        await db.query("INSERT INTO prompt_seed_sources (source) VALUES ($1) ON CONFLICT (source) DO NOTHING", [source]);
    }
}

async function insertPostgresPrompts(db: QueryExecutor, prompts: StoredPrompt[]) {
    for (const prompt of prompts) {
        await db.query(
            `
            INSERT INTO prompts (id, scope, owner_user_id, title, cover_url, prompt, tags, category, preview, github_url, source, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (id) DO UPDATE SET
                scope = EXCLUDED.scope,
                owner_user_id = EXCLUDED.owner_user_id,
                title = EXCLUDED.title,
                cover_url = EXCLUDED.cover_url,
                prompt = EXCLUDED.prompt,
                tags = EXCLUDED.tags,
                category = EXCLUDED.category,
                preview = EXCLUDED.preview,
                github_url = EXCLUDED.github_url,
                source = EXCLUDED.source,
                created_at = EXCLUDED.created_at,
                updated_at = EXCLUDED.updated_at
            `,
            [
                prompt.id,
                prompt.scope,
                prompt.scope === "user" ? prompt.ownerUserId || null : null,
                prompt.title,
                prompt.coverUrl,
                prompt.prompt,
                JSON.stringify(prompt.tags),
                prompt.category,
                prompt.preview,
                prompt.githubUrl || null,
                prompt.source || null,
                prompt.createdAt,
                prompt.updatedAt,
            ],
        );
    }
}

function mapPostgresPrompt(row: Record<string, unknown>): StoredPrompt {
    return {
        id: dbText(row.id),
        scope: row.scope === "user" ? "user" : "library",
        ownerUserId: dbOptionalText(row.owner_user_id),
        title: dbText(row.title),
        coverUrl: dbText(row.cover_url),
        prompt: dbText(row.prompt),
        tags: dbJson<string[]>(row.tags, []),
        category: dbText(row.category),
        preview: dbText(row.preview),
        githubUrl: dbOptionalText(row.github_url),
        source: dbOptionalText(row.source),
        createdAt: dbIso(row.created_at),
        updatedAt: dbIso(row.updated_at),
    };
}

function dbText(value: unknown) {
    return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function dbOptionalText(value: unknown) {
    const text = dbText(value);
    return text || undefined;
}

function dbIso(value: unknown) {
    const date = value instanceof Date ? value : new Date(dbText(value));
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function dbJson<T>(value: unknown, fallback: T): T {
    if (value === null || value === undefined) return fallback;
    return value as T;
}

function emptyPromptDb(): PromptDatabase {
    return { version: 1, prompts: [], seedSources: [] };
}

function normalizeStoredPrompt(value: StoredPrompt): StoredPrompt {
    const now = new Date().toISOString();
    return {
        id: value.id || randomUUID(),
        scope: value.scope === "user" ? "user" : "library",
        ownerUserId: value.ownerUserId,
        title: repairMojibakeText(value.title || "") || "未命名提示词",
        coverUrl: value.coverUrl || "",
        prompt: repairMojibakeText(value.prompt || ""),
        tags: normalizeTags(value.tags),
        category: repairMojibakeText(value.category || "") || "默认",
        preview: repairMojibakeText(value.preview || ""),
        githubUrl: value.githubUrl,
        source: value.source,
        createdAt: value.createdAt || now,
        updatedAt: value.updatedAt || value.createdAt || now,
    };
}

function repairMojibakeText(value: string) {
    if (!looksLikeUtf8Mojibake(value)) return value;
    const repaired = Buffer.from(value, "latin1").toString("utf8");
    if (!repaired || repaired.includes("\uFFFD")) return value;
    return textQualityScore(repaired) > textQualityScore(value) ? repaired : value;
}

function looksLikeUtf8Mojibake(value: string) {
    if (!value) return false;
    if (/[\u0080-\u009f]/.test(value)) return true;
    if (/[ÂÃ][\u0080-\u00ff]/.test(value)) return true;
    const markers = value.match(/[åæçèéäöüï½ð]/g)?.length || 0;
    return markers >= 2 && !/[\u4e00-\u9fff]/.test(value);
}

function textQualityScore(value: string) {
    const cjk = value.match(/[\u4e00-\u9fff]/g)?.length || 0;
    const controls = value.match(/[\u0080-\u009f]/g)?.length || 0;
    const replacements = value.match(/\uFFFD/g)?.length || 0;
    const mojibakeMarkers = value.match(/[ÂÃåæçèéäöüï½ð]/g)?.length || 0;
    return cjk * 4 - controls * 6 - replacements * 20 - mojibakeMarkers;
}

function collectTags(items: StoredPrompt[]) {
    return Array.from(new Set(items.flatMap((item) => item.tags).filter(isUsefulPromptTag)));
}

function collectCategories(items: StoredPrompt[]) {
    return Array.from(new Set(items.map((item) => item.category).filter(Boolean)));
}

function isActiveOption(value: string) {
    return value && value !== "全部" && value !== "all";
}

function isManagedPromptSeedSource(source?: string) {
    return Boolean(source && MANAGED_PROMPT_SEED_SOURCE_PREFIXES.some((prefix) => source.startsWith(prefix)));
}

function isManagedPromptSeedSourceExceptCurrent(source?: string) {
    return Boolean(source && source !== AWESOME_PROMPT_SEED_SOURCE && isManagedPromptSeedSource(source));
}

function isUsefulPromptTag(tag?: string) {
    const value = (tag || "").trim();
    if (!value || value.length > 24) return false;
    if (value.startsWith("@")) return false;
    if (/^aws?ome-?gpt/i.test(value)) return false;
    if (/^(moosl|openai)$/i.test(value)) return false;
    return true;
}
