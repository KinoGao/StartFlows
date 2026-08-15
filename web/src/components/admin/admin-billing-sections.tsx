"use client";

import { BillingOperations } from "@/app/admin/billing/components/billing-operations";
import type { AdminDashboardController } from "./use-admin-dashboard-controller";

export function AdminOrdersSection({ controller }: { controller: AdminDashboardController }) {
    const { activeSection } = controller;
    if (activeSection !== "orders") return null;
    return <BillingOperations initialTab="orders" embedded hideTabs />;
}

export function AdminProductsSection({ controller }: { controller: AdminDashboardController }) {
    const { activeSection } = controller;
    if (activeSection !== "products") return null;
    return <BillingOperations initialTab="products" embedded hideTabs />;
}

export function AdminPromotionsSection({ controller }: { controller: AdminDashboardController }) {
    const { activeSection } = controller;
    if (activeSection !== "promotions") return null;
    return <BillingOperations initialTab="promotions" embedded hideTabs />;
}

export function AdminCouponsSection({ controller }: { controller: AdminDashboardController }) {
    const { activeSection } = controller;
    if (activeSection !== "coupons") return null;
    return <BillingOperations initialTab="coupons" embedded hideTabs />;
}

export function AdminPaymentsSection({ controller }: { controller: AdminDashboardController }) {
    const { paymentConfig, activeSection } = controller;
    if (activeSection !== "payments") return null;
    return <BillingOperations initialTab="payments" initialPaymentConfig={paymentConfig || undefined} embedded hideTabs />;
}
