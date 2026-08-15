export type WorkModerationRiskLevel = "safe" | "review" | "block";

export type WorkModerationSignal = {
    riskLevel: WorkModerationRiskLevel;
    labels: string[];
    summary: string;
    checkedAt: string;
};

type ModerationInput = { title: string; description: string; publicPrompt?: string; category: string; tags: string[] };
type ModerationEnv = Record<string, string | undefined>;
type ModerationOptions = { env?: ModerationEnv; fetchImpl?: typeof fetch; now?: () => Date };

export async function moderateWorkContent(input: ModerationInput, options: ModerationOptions = {}) {
    const env = options.env || process.env;
    const provider = env.VOZEB_PRO_CONTENT_MODERATION_PROVIDER?.trim().toLowerCase() || "manual";
    const checkedAt = (options.now || (() => new Date()))().toISOString();

    if (provider === "keywords") return keywordModeration(input, env.VOZEB_PRO_CONTENT_MODERATION_KEYWORDS, checkedAt);
    if (provider === "http") {
        try {
            return await httpModeration(input, env, options.fetchImpl || fetch, checkedAt);
        } catch {
            return { provider: "manual", signal: { riskLevel: "review", labels: ["provider_unavailable"], summary: "外部内容审核暂不可用，需要人工复核。", checkedAt } satisfies WorkModerationSignal };
        }
    }
    return { provider: "manual", signal: { riskLevel: "review", labels: [], summary: "等待人工审核。", checkedAt } satisfies WorkModerationSignal };
}

function keywordModeration(input: ModerationInput, value: string | undefined, checkedAt: string) {
    const keywords = [
        ...new Set(
            (value || "")
                .split(/[\n,，]/)
                .map((item) => item.trim().toLowerCase())
                .filter(Boolean),
        ),
    ].slice(0, 500);
    const content = [input.title, input.description, input.publicPrompt || "", input.category, ...input.tags].join("\n").toLowerCase();
    const matches = keywords.filter((keyword) => content.includes(keyword)).slice(0, 20);
    return {
        provider: "keywords",
        signal: {
            riskLevel: matches.length ? "review" : "safe",
            labels: matches.map((keyword) => `keyword:${keyword}`),
            summary: matches.length ? `命中 ${matches.length} 个需要人工复核的关键词。` : "未命中已配置的风险关键词。",
            checkedAt,
        } satisfies WorkModerationSignal,
    };
}

async function httpModeration(input: ModerationInput, env: ModerationEnv, fetchImpl: typeof fetch, checkedAt: string) {
    const endpoint = new URL(env.VOZEB_PRO_CONTENT_MODERATION_URL || "");
    if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") throw new Error("Invalid moderation endpoint");
    const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(env.VOZEB_PRO_CONTENT_MODERATION_API_KEY ? { Authorization: `Bearer ${env.VOZEB_PRO_CONTENT_MODERATION_API_KEY}` } : {}) },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`Moderation provider returned ${response.status}`);
    const payload = (await response.json()) as { riskLevel?: unknown; labels?: unknown; summary?: unknown };
    const riskLevel: WorkModerationRiskLevel = payload.riskLevel === "safe" || payload.riskLevel === "block" ? payload.riskLevel : "review";
    const labels = Array.isArray(payload.labels)
        ? payload.labels
              .filter((label): label is string => typeof label === "string")
              .map((label) => label.slice(0, 80))
              .slice(0, 20)
        : [];
    const summary = typeof payload.summary === "string" && payload.summary.trim() ? payload.summary.trim().slice(0, 300) : "外部内容审核已返回风险信号。";
    return { provider: "http", signal: { riskLevel, labels, summary, checkedAt } satisfies WorkModerationSignal };
}
