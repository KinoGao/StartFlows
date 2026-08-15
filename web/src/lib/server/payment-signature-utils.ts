import { createVerify } from "node:crypto";
import { readFileSync } from "node:fs";

import { BillingInputError } from "@/lib/server/billing-errors";
import { getPaymentRuntimeEnv, type PaymentRuntimeConfig } from "@/lib/server/payment-config-store";

export function verifyRsaSha256(content: string, signature: string, publicKey: string) {
    try {
        return createVerify("RSA-SHA256").update(content, "utf8").verify(publicKey, signature, "base64");
    } catch {
        return false;
    }
}

export function loadPaymentPublicKey(paymentConfig: PaymentRuntimeConfig, valueEnv: string, pathEnv: string, certificateEnv?: string, certificatePathEnv?: string) {
    const direct = getPaymentRuntimeEnv(paymentConfig, valueEnv) || (certificateEnv ? getPaymentRuntimeEnv(paymentConfig, certificateEnv) : "");
    if (direct) return normalizePublicKey(direct);
    const path = getPaymentRuntimeEnv(paymentConfig, pathEnv) || (certificatePathEnv ? getPaymentRuntimeEnv(paymentConfig, certificatePathEnv) : "");
    if (path) return normalizePublicKey(readFileSync(path, "utf8"));
    throw new BillingInputError(`缺少支付公钥配置：${valueEnv}`, 500);
}

function normalizePublicKey(value: string) {
    const text = value.replace(/\\n/g, "\n").trim();
    if (text.includes("-----BEGIN")) return text;
    return `-----BEGIN PUBLIC KEY-----\n${text.match(/.{1,64}/g)?.join("\n") || text}\n-----END PUBLIC KEY-----`;
}
