"use client";

import { ReferralRewardsPanel } from "@/app/admin/marketing/components/referral-rewards-panel";
import type { AdminDashboardController } from "./use-admin-dashboard-controller";

export { AdminCouponsSection, AdminPromotionsSection } from "./admin-billing-sections";

export function AdminReferralsSection({ controller }: { controller: AdminDashboardController }) {
    if (controller.activeSection !== "referrals") return null;
    return <ReferralRewardsPanel />;
}
