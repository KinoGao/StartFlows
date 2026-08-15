export const REFERENCE_ASSET_SIGNATURE_PURPOSE = "provider-read";

export function isReferenceAssetUrl(value: string) {
    try {
        return new URL(value, "https://vozeb.invalid").pathname.startsWith("/api/reference-assets/");
    } catch {
        return false;
    }
}

export function hasProviderReadSignatureShape(value: string) {
    try {
        const url = new URL(value, "https://vozeb.invalid");
        const expires = url.searchParams.get("expires") || "";
        return url.pathname.startsWith("/api/reference-assets/") && url.searchParams.get("purpose") === REFERENCE_ASSET_SIGNATURE_PURPOSE && /^\d+$/.test(expires) && Number(expires) > 0 && Boolean(url.searchParams.get("signature"));
    } catch {
        return false;
    }
}
