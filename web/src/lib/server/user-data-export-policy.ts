const OMITTED_KEYS = new Set(
    [
        "accessKey",
        "accessKeyId",
        "apiKey",
        "agentBrief",
        "authorization",
        "brandKit",
        "choices",
        "contextSummary",
        "contextSummaryThroughSequence",
        "cookie",
        "credentials",
        "creativeBrief",
        "decisions",
        "dataUrl",
        "deliverables",
        "executionPlan",
        "externalObjectKey",
        "foundation",
        "materialPlan",
        "modelSelectionReason",
        "moderationSignal",
        "password",
        "passwordHash",
        "plannerOutput",
        "planningPrompt",
        "paymentIdentityHash",
        "promptTemplate",
        "providerRequest",
        "providerResponse",
        "registrationIpHash",
        "rawPayload",
        "remoteUrl",
        "reviewDetails",
        "reviewedByUserId",
        "riskSignals",
        "resolvedPrompt",
        "rewrittenPrompt",
        "secretAccessKey",
        "secretKey",
        "sessionToken",
        "setCookie",
        "systemPrompt",
        "tokenHash",
        "visualDirection",
        "attributionMetadata",
        "workbenchPlan",
    ].map(normalizeKey),
);

const STRONG_SIGNED_URL_PARAMS = new Set(["X-Amz-Algorithm", "X-Amz-Credential", "X-Amz-Signature", "X-Amz-Security-Token", "X-Oss-Signature", "X-Oss-Credential", "X-Cos-Security-Token", "X-Obs-Signature"].map((key) => key.toLowerCase()));

export function sanitizePortableData(value: unknown, path: string[] = []): unknown {
    if (value === null || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "string") return isEmbeddedOrSignedMedia(value) ? undefined : value;
    if (Array.isArray(value)) return value.map((item) => sanitizePortableData(item, path)).filter((item) => item !== undefined);
    if (!value || typeof value !== "object") return undefined;

    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => !shouldOmitKey(key, path))
            .map(([key, item]) => [key, sanitizePortableData(item, [...path, normalizeKey(key)])] as const)
            .filter((entry): entry is [string, unknown] => entry[1] !== undefined),
    );
}

function normalizeKey(value: string) {
    return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function shouldOmitKey(key: string, path: string[]) {
    const normalized = normalizeKey(key);
    if (OMITTED_KEYS.has(normalized)) return true;
    return normalized === "prompt" && path.includes("metadata");
}

function isEmbeddedOrSignedMedia(value: string) {
    const trimmed = value.trim();
    if (/^(data|blob):/i.test(trimmed)) return true;
    if (!/^https?:\/\//i.test(trimmed)) return false;
    try {
        const params = new URL(trimmed).searchParams;
        const keys = Array.from(params.keys(), (key) => key.toLowerCase());
        if (keys.some((key) => STRONG_SIGNED_URL_PARAMS.has(key))) return true;
        return (params.has("signature") || params.has("Signature")) && (params.has("expires") || params.has("Expires"));
    } catch {
        return false;
    }
}
