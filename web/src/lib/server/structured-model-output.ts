export function strictJsonObjectText(value: unknown) {
    if (typeof value !== "string") return "";
    const text = value.trim();
    if (text.startsWith("{") && text.endsWith("}")) return text;
    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim() || "";
    return fenced.startsWith("{") && fenced.endsWith("}") ? fenced : "";
}
