const RESULT_LIST_KEYS = ["results", "images", "videos", "outputs", "items", "assets"] as const;
const RESULT_WRAPPER_KEYS = ["data", "result", "output", "task"] as const;

export function agentTaskResultItems(value: unknown) {
    const root = resultRecord(value);
    if (!root) return [{}];
    const items: Record<string, unknown>[] = [];

    const visit = (record: Record<string, unknown>, depth: number) => {
        if (items.length >= 10) return;
        const nested = RESULT_LIST_KEYS.map((key) => record[key]).find(Array.isArray);
        const records = Array.isArray(nested) ? nested.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
        if (records.length && depth < 4) {
            records.forEach((item) => visit(item, depth + 1));
            return;
        }
        const wrapper = RESULT_WRAPPER_KEYS.map((key) => resultRecord(record[key])).find((item): item is Record<string, unknown> => Boolean(item));
        if (wrapper && depth < 4) {
            visit(wrapper, depth + 1);
            return;
        }
        items.push(record);
    };

    visit(root, 0);
    return items.length ? items : [root];
}

function resultRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
