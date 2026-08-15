export type DramaScriptRichMark = {
    type: "bold" | "italic" | "underline" | "strike" | "textStyle" | "highlight" | "link";
    attrs?: Record<string, string>;
};

export type DramaScriptRichNode = {
    type: "doc" | "paragraph" | "heading" | "bulletList" | "orderedList" | "listItem" | "blockquote" | "text" | "hardBreak";
    attrs?: Record<string, string | number>;
    marks?: DramaScriptRichMark[];
    text?: string;
    content?: DramaScriptRichNode[];
};

export type DramaScriptRichContent = DramaScriptRichNode & { type: "doc" };

const NODE_TYPES = new Set<DramaScriptRichNode["type"]>(["doc", "paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote", "text", "hardBreak"]);
const MARK_TYPES = new Set<DramaScriptRichMark["type"]>(["bold", "italic", "underline", "strike", "textStyle", "highlight", "link"]);
const COLORS = /^#[0-9a-f]{6}$/i;
const FONT_SIZES = new Set(["12px", "14px", "16px", "18px", "20px", "24px"]);
const ALIGNMENTS = new Set(["left", "center", "right", "justify"]);

export function plainTextToDramaRichContent(value: string): DramaScriptRichContent {
    return {
        type: "doc",
        content: value.split("\n").map((line) => ({ type: "paragraph", content: line ? [{ type: "text", text: line }] : undefined })),
    };
}

export function dramaRichContentToPlainText(value: DramaScriptRichContent): string {
    return (value.content || []).map(blockText).join("\n");
}

export function normalizeDramaScriptRichContent(value: unknown): DramaScriptRichContent | undefined {
    const normalized = normalizeNode(value, true);
    return normalized?.type === "doc" ? (normalized as DramaScriptRichContent) : undefined;
}

function normalizeNode(value: unknown, root = false): DramaScriptRichNode | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const input = value as Record<string, unknown>;
    const type = String(input.type || "") as DramaScriptRichNode["type"];
    if (!NODE_TYPES.has(type) || (root && type !== "doc") || (!root && type === "doc")) return undefined;
    if (type === "text") {
        if (typeof input.text !== "string") return undefined;
        const marks = Array.isArray(input.marks) ? input.marks.flatMap(normalizeMark) : [];
        return { type, text: input.text, marks: marks.length ? marks : undefined };
    }
    if (type === "hardBreak") return { type };
    const content = Array.isArray(input.content) ? input.content.map((child) => normalizeNode(child)).filter((child): child is DramaScriptRichNode => Boolean(child)) : [];
    const attrs = normalizeNodeAttrs(type, input.attrs);
    return { type, attrs, content: content.length ? content : undefined };
}

function normalizeNodeAttrs(type: DramaScriptRichNode["type"], value: unknown): Record<string, string | number> | undefined {
    const input = object(value);
    if (type === "heading") {
        const level = Number(input.level);
        return { level: level === 2 || level === 3 ? level : 1, ...(ALIGNMENTS.has(String(input.textAlign)) ? { textAlign: String(input.textAlign) } : {}) };
    }
    if (type === "paragraph") return ALIGNMENTS.has(String(input.textAlign)) ? { textAlign: String(input.textAlign) } : undefined;
    if (type === "orderedList") {
        const start = Math.max(1, Math.floor(Number(input.start) || 1));
        return start === 1 ? undefined : { start };
    }
    return undefined;
}

function normalizeMark(value: unknown): DramaScriptRichMark[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const input = value as Record<string, unknown>;
    const type = String(input.type || "") as DramaScriptRichMark["type"];
    if (!MARK_TYPES.has(type)) return [];
    const attrs = object(input.attrs);
    if (type === "textStyle") {
        const color = COLORS.test(String(attrs.color || "")) ? String(attrs.color) : undefined;
        const fontSize = FONT_SIZES.has(String(attrs.fontSize)) ? String(attrs.fontSize) : undefined;
        return [{ type, attrs: color || fontSize ? { ...(color ? { color } : {}), ...(fontSize ? { fontSize } : {}) } : undefined }];
    }
    if (type === "highlight") {
        const color = COLORS.test(String(attrs.color || "")) ? String(attrs.color) : undefined;
        return [{ type, attrs: color ? { color } : undefined }];
    }
    if (type === "link") {
        const href = safeHref(attrs.href);
        return href ? [{ type, attrs: { href, target: "_blank", rel: "noopener noreferrer nofollow" } }] : [];
    }
    return [{ type }];
}

function safeHref(value: unknown) {
    const href = typeof value === "string" ? value.trim() : "";
    if (!href || href.length > 2048) return undefined;
    if (/^(https?:|mailto:)/i.test(href) || href.startsWith("/") || href.startsWith("#")) return href;
    return undefined;
}

function blockText(node: DramaScriptRichNode): string {
    if (node.type === "text") return node.text || "";
    if (node.type === "hardBreak") return "\n";
    const separator = node.type === "doc" || node.type === "bulletList" || node.type === "orderedList" || node.type === "blockquote" ? "\n" : "";
    return (node.content || []).map(blockText).join(separator);
}

function object(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
