import { BillingResultPage } from "../billing-result-page";

export default async function BillingSuccessPage({ searchParams }: { searchParams: Promise<{ orderId?: string }> }) {
    return <BillingResultPage mode="success" orderId={(await searchParams).orderId?.trim() || ""} />;
}
