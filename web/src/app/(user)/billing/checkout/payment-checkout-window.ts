import type { PaymentCheckout } from "@/services/api/billing";

import { safePaymentHttpUrl } from "@/lib/payment-url";

export type PaymentCheckoutOpenResult = { status: "opened" | "blocked" | "invalid" | "manual"; fallbackValue?: string };

type CheckoutWindow = Pick<Window, "close" | "document" | "location"> & { opener: Window["opener"] };
type WindowOpen = (url?: string | URL, target?: string, features?: string) => Window | null;

export function openPaymentCheckoutWindow(checkout: PaymentCheckout, openWindow: WindowOpen = (url, target, features) => window.open(url, target, features)): PaymentCheckoutOpenResult {
    const fallbackValue = checkout.qrContent || checkout.url || checkout.orderNo;
    if (checkout.kind === "manual") return { status: "manual", fallbackValue };

    const redirectUrl = safePaymentUrl(checkout.url || checkout.qrContent);
    if (redirectUrl) return openPaymentRedirect(redirectUrl, fallbackValue, openWindow);

    if (checkout.kind === "form" && checkout.form) return openPaymentRedirect(`/api/billing/orders/${encodeURIComponent(checkout.orderId)}/payment-form`, fallbackValue, openWindow);

    return { status: "invalid", fallbackValue };
}

export function safePaymentUrl(value?: string) {
    return safePaymentHttpUrl(value);
}

function openPaymentRedirect(url: string, fallbackValue: string, openWindow: WindowOpen): PaymentCheckoutOpenResult {
    const popup = openCheckoutWindow(openWindow);
    if (!popup) return { status: "blocked", fallbackValue };
    try {
        popup.location.replace(url);
        return { status: "opened" };
    } catch {
        closePopup(popup);
        return { status: "invalid", fallbackValue };
    }
}

function openCheckoutWindow(openWindow: WindowOpen): CheckoutWindow | null {
    const popup = openWindow("about:blank", "_blank");
    if (!popup) return null;
    const checkoutWindow = popup as CheckoutWindow;
    checkoutWindow.opener = null;
    try {
        checkoutWindow.document.title = "正在打开支付";
        checkoutWindow.document.body.textContent = "正在打开支付页面，请稍候...";
    } catch {
        // Some browser payment windows restrict document access; navigation can still continue.
    }
    return checkoutWindow;
}

function closePopup(popup: CheckoutWindow) {
    try {
        popup.close();
    } catch {
        // Ignore close failures from browser-managed payment windows.
    }
}
