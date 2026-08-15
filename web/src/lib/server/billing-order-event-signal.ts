import { subscribePostgresNotification } from "@/lib/server/database";
import { BILLING_ORDER_NOTIFY_CHANNEL } from "@/lib/server/database/billing-order-repository";

export async function subscribeBillingOrderEvent(orderId: string, listener: () => void) {
    const targetOrderId = orderId.trim();
    if (!targetOrderId) throw new Error("Billing order ID is required");
    return subscribePostgresNotification(BILLING_ORDER_NOTIFY_CHANNEL, (payload) => {
        if (payload.trim() === targetOrderId) listener();
    });
}
