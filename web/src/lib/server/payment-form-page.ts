import { randomBytes } from "node:crypto";

import type { PaymentForm } from "./payment-form";

export function createPaymentFormPage(form: PaymentForm) {
    const nonce = randomBytes(18).toString("base64url");
    const action = new URL(form.action);
    const fields = form.fields.map((field) => `<input type="hidden" name="${escapeHtml(field.name)}" value="${escapeHtml(field.value)}">`).join("");
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>正在打开支付</title></head><body><p>正在打开支付页面，请稍候...</p><form id="payment-form" action="${escapeHtml(form.action)}" method="${form.method}">${fields}<noscript><button type="submit">继续支付</button></noscript></form><script nonce="${nonce}">document.getElementById("payment-form").submit()</script></body></html>`;
    return {
        html,
        contentSecurityPolicy: `default-src 'none'; base-uri 'none'; form-action ${action.origin}; script-src 'nonce-${nonce}'; frame-ancestors 'none'`,
    };
}

function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}
