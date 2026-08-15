export type CreativeComplexity = "simple" | "complex";
export type CreativeMediaType = "text" | "image" | "video" | "audio";

export type CreativeBrief = {
    objective: string;
    audience?: string;
    usage?: string;
    coreMessage?: string;
    constraints?: string[];
    referenceStrategy?: string;
};

export type CreativeVisualDirection = {
    summary: string;
    style?: string;
    composition?: string;
    colors?: string[];
    lighting?: string;
    keywords?: string[];
    avoid?: string[];
};

export type CreativeFoundation = {
    complexity: CreativeComplexity;
    brief: CreativeBrief;
    direction: CreativeVisualDirection;
};

export type CreativeDeliverableSummary = {
    title: string;
    type: CreativeMediaType;
    role: string;
};

export type CreativeReviewIssue = {
    taskId?: string;
    category: string;
    severity: "low" | "medium" | "high";
    message: string;
    correction?: string;
};

export type CreativeReview = {
    mode: "visual" | "text" | "unavailable";
    status: "passed" | "needs_revision" | "unavailable";
    score?: number;
    summary: string;
    issues: CreativeReviewIssue[];
    retryTaskIds: string[];
};

const mediaTypes = new Set<CreativeMediaType>(["text", "image", "video", "audio"]);

export function normalizeCreativeFoundation(value: unknown, fallbackObjective: string): CreativeFoundation {
    const record = object(value);
    const brief = object(record.brief);
    const direction = object(record.direction);
    const objective = text(brief.objective) || text(fallbackObjective) || "完成当前创作需求";
    return {
        complexity: record.complexity === "complex" ? "complex" : "simple",
        brief: compact({
            objective,
            audience: text(brief.audience),
            usage: text(brief.usage),
            coreMessage: text(brief.coreMessage),
            constraints: strings(brief.constraints),
            referenceStrategy: text(brief.referenceStrategy),
        }),
        direction: compact({
            summary: text(direction.summary) || "保持主体、信息和视觉语言清晰统一",
            style: text(direction.style),
            composition: text(direction.composition),
            colors: strings(direction.colors),
            lighting: text(direction.lighting),
            keywords: strings(direction.keywords),
            avoid: strings(direction.avoid),
        }),
    };
}

export function normalizeCreativeDeliverables(value: unknown, fallback: CreativeDeliverableSummary): CreativeDeliverableSummary[] {
    const items = Array.isArray(value) ? value : [];
    const deliverables = items.flatMap((item) => {
        const record = object(item);
        const type = text(record.type) as CreativeMediaType;
        const title = text(record.title);
        const role = text(record.role);
        return title && role && mediaTypes.has(type) ? [{ title, type, role }] : [];
    });
    return deliverables.length ? deliverables : [fallback];
}

export function normalizeCreativeReview(value: unknown, validTaskIds: Set<string> = new Set()): CreativeReview | null {
    const record = object(value);
    const mode = record.mode === "visual" || record.mode === "text" || record.mode === "unavailable" ? record.mode : null;
    const status = record.status === "passed" || record.status === "needs_revision" || record.status === "unavailable" ? record.status : null;
    const summary = text(record.summary);
    if (!mode || !status || !summary) return null;
    const rawScore = Number(record.score);
    const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : undefined;
    const issues = (Array.isArray(record.issues) ? record.issues : []).flatMap((item) => {
        const issue = object(item);
        const category = text(issue.category);
        const message = text(issue.message);
        if (!category || !message) return [];
        const taskId = text(issue.taskId);
        const severity: CreativeReviewIssue["severity"] = issue.severity === "high" || issue.severity === "medium" ? issue.severity : "low";
        const normalized: CreativeReviewIssue = compact({ taskId: taskId && (!validTaskIds.size || validTaskIds.has(taskId)) ? taskId : "", category, severity, message, correction: text(issue.correction) });
        return [normalized];
    });
    const actionableTaskIds = new Set(issues.filter((issue) => issue.taskId && issue.severity !== "low").map((issue) => issue.taskId as string));
    const retryTaskIds =
        status === "needs_revision" ? Array.from(new Set((Array.isArray(record.retryTaskIds) ? record.retryTaskIds : []).map((item) => text(item)).filter((id): id is string => Boolean(id && validTaskIds.has(id) && actionableTaskIds.has(id))))) : [];
    return { mode, status, ...(score !== undefined ? { score } : {}), summary, issues, retryTaskIds };
}

export function unavailableCreativeReview(summary: string): CreativeReview {
    return { mode: "unavailable", status: "unavailable", summary, issues: [], retryTaskIds: [] };
}

export function withCreativeFoundation(prompt: string, foundation: CreativeFoundation) {
    const value = prompt.trim();
    if (!value || value.includes("统一创作约束：")) return value;
    const { brief, direction } = foundation;
    const lines = [
        `目标：${brief.objective}`,
        brief.audience ? `受众：${brief.audience}` : "",
        brief.usage ? `使用场景：${brief.usage}` : "",
        brief.coreMessage ? `核心信息：${brief.coreMessage}` : "",
        brief.referenceStrategy ? `参考素材策略：${brief.referenceStrategy}` : "",
        `视觉方向：${direction.summary}`,
        direction.style ? `风格：${direction.style}` : "",
        direction.composition ? `构图/镜头：${direction.composition}` : "",
        direction.colors?.length ? `色彩：${direction.colors.join("、")}` : "",
        direction.lighting ? `光线：${direction.lighting}` : "",
        direction.keywords?.length ? `视觉关键词：${direction.keywords.join("、")}` : "",
        [...(brief.constraints || []), ...(direction.avoid || [])].length ? `避免：${[...(brief.constraints || []), ...(direction.avoid || [])].join("；")}` : "",
    ].filter(Boolean);
    return `${value}\n\n统一创作约束：\n${lines.join("\n")}`;
}

function object(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown) {
    return Array.isArray(value) ? Array.from(new Set(value.map((item) => text(item)).filter(Boolean))) : undefined;
}

function compact<T extends Record<string, unknown>>(value: T) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== "" && item !== undefined && (!Array.isArray(item) || item.length))) as T;
}
