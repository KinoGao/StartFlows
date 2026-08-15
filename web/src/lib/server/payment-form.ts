import { parseFragment, type DefaultTreeAdapterMap } from "parse5";

import { safePaymentHttpUrl } from "@/lib/payment-url";

export type PaymentFormField = { name: string; value: string };
export type PaymentForm = { action: string; method: "GET" | "POST"; fields: PaymentFormField[] };

type HtmlNode = DefaultTreeAdapterMap["node"];
type HtmlElement = DefaultTreeAdapterMap["element"];

export function parsePaymentFormHtml(html: string, baseUrl?: string): PaymentForm | undefined {
    const source = html.trim().slice(0, 40_000);
    if (!source) return undefined;
    const form = findElement(parseFragment(source), "form");
    if (!form) return undefined;
    const action = safePaymentAction(attribute(form, "action"), baseUrl);
    if (!action) return undefined;
    const method = attribute(form, "method").toUpperCase() === "GET" ? "GET" : "POST";
    const fields = descendantElements(form, "input")
        .filter((input) => !hasAttribute(input, "disabled") && !["button", "file", "image", "password", "reset", "submit"].includes(attribute(input, "type").toLowerCase()))
        .map((input) => ({ name: cleanFieldName(attribute(input, "name")), value: attribute(input, "value").slice(0, 10_000) }))
        .filter((field): field is PaymentFormField => Boolean(field.name))
        .slice(0, 200);
    return { action, method, fields };
}

export function normalizePaymentForm(value: unknown, baseUrl?: string): PaymentForm | undefined {
    if (typeof value === "string") return parsePaymentFormHtml(value, baseUrl);
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    const action = safePaymentAction(typeof record.action === "string" ? record.action : "", baseUrl);
    if (!action) return undefined;
    const method = String(record.method || "POST").toUpperCase() === "GET" ? "GET" : "POST";
    const fields = normalizeFields(record.fields);
    return { action, method, fields };
}

function normalizeFields(value: unknown): PaymentFormField[] {
    if (Array.isArray(value)) {
        return value
            .map((item) => {
                const record = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
                const name = cleanFieldName(record.name);
                return name ? { name, value: String(record.value ?? "").slice(0, 10_000) } : null;
            })
            .filter((field): field is PaymentFormField => Boolean(field))
            .slice(0, 200);
    }
    if (!value || typeof value !== "object") return [];
    return Object.entries(value as Record<string, unknown>)
        .map(([name, item]) => ({ name: cleanFieldName(name), value: String(item ?? "").slice(0, 10_000) }))
        .filter((field): field is PaymentFormField => Boolean(field.name))
        .slice(0, 200);
}

function safePaymentAction(value: string, baseUrl?: string) {
    const action = safePaymentHttpUrl(value, { baseUrl });
    return action.length <= 2_000 ? action : "";
}

function cleanFieldName(value: unknown) {
    const name = typeof value === "string" ? value.trim().slice(0, 200) : "";
    return name && !/[\0\r\n]/.test(name) ? name : "";
}

function findElement(node: HtmlNode, tagName: string): HtmlElement | undefined {
    if (isElement(node) && node.tagName === tagName) return node;
    for (const child of childNodes(node)) {
        const match = findElement(child, tagName);
        if (match) return match;
    }
    return undefined;
}

function descendantElements(node: HtmlNode, tagName: string): HtmlElement[] {
    return childNodes(node).flatMap((child) => [...(isElement(child) && child.tagName === tagName ? [child] : []), ...descendantElements(child, tagName)]);
}

function attribute(element: HtmlElement, name: string) {
    return element.attrs.find((item) => item.name.toLowerCase() === name)?.value || "";
}

function hasAttribute(element: HtmlElement, name: string) {
    return element.attrs.some((item) => item.name.toLowerCase() === name);
}

function childNodes(node: HtmlNode): HtmlNode[] {
    return "childNodes" in node && Array.isArray(node.childNodes) ? node.childNodes : [];
}

function isElement(node: HtmlNode): node is HtmlElement {
    return "tagName" in node && typeof node.tagName === "string";
}
