import { BillingCheckoutPage } from "./checkout-client";

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ product?: string | string[] }> }) {
    const params = await searchParams;
    const productId = Array.isArray(params.product) ? params.product[0] : params.product;
    return <BillingCheckoutPage productId={productId?.trim() || ""} />;
}
