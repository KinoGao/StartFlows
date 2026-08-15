import { BillingResultPage } from "../billing-result-page";

export default async function BillingCancelPage({ searchParams }: { searchParams: Promise<{ orderId?: string }> }) {
    return <BillingResultPage mode="cancel" orderId={(await searchParams).orderId?.trim() || ""} />;
}
