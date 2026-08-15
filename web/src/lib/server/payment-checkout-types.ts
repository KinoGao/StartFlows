import type { PaymentForm } from "./payment-form";

export type PaymentCheckoutKind = "manual" | "redirect" | "form" | "qr";

export type PaymentCheckoutResult = {
    provider: string;
    orderId: string;
    orderNo: string;
    kind: PaymentCheckoutKind;
    url?: string;
    form?: PaymentForm;
    qrContent?: string;
    providerOrderId?: string;
    providerPaymentId?: string;
    expiresAt?: string;
};

export type CreatePaymentCheckoutOptions = {
    origin?: string;
    provider?: unknown;
    userId?: string;
};
