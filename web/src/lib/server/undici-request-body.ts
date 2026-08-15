import { FormData as UndiciFormData } from "undici";

export async function toUndiciRequestBody(body: BodyInit | null | undefined) {
    if (!isFormDataBody(body)) return body as import("undici").RequestInit["body"];
    const form = new UndiciFormData();
    for (const [name, value] of body.entries()) {
        if (typeof value === "string") {
            form.append(name, value);
            continue;
        }
        form.append(name, new Blob([await value.arrayBuffer()], { type: value.type || "application/octet-stream" }), value.name || "file");
    }
    return form;
}

function isFormDataBody(body: BodyInit | null | undefined): body is FormData {
    if (!body || typeof body !== "object") return false;
    if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return false;
    if (typeof Headers !== "undefined" && body instanceof Headers) return false;
    const tag = Object.prototype.toString.call(body);
    if (tag === "[object URLSearchParams]" || tag === "[object Headers]") return false;
    return "entries" in body && typeof body.entries === "function";
}
