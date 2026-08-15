import { redirect } from "next/navigation";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ product?: string | string[] }> }) {
    const params = await searchParams;
    const product = Array.isArray(params.product) ? params.product[0] : params.product;
    redirect(product?.trim() ? `/profile?section=billing&product=${encodeURIComponent(product.trim())}` : "/profile?section=billing");
}
