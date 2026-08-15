export const ACCOUNT_ID_MIN_WIDTH = 4;

export function parseAccountId(value: unknown) {
    const text = typeof value === "string" ? value.trim() : String(value ?? "");
    if (!/^\d+$/.test(text)) return undefined;
    const parsed = Number(text);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function formatAccountId(value: unknown) {
    const parsed = parseAccountId(value);
    return parsed ? String(parsed).padStart(ACCOUNT_ID_MIN_WIDTH, "0") : "0000";
}
