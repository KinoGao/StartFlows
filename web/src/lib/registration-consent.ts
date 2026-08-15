export type RegistrationPolicyConsent = {
    termsVersion: string;
    termsUrl: string;
    privacyVersion: string;
    privacyUrl: string;
    acceptedAt: string;
};

export function createRegistrationPolicyConsent(policy: Pick<RegistrationPolicyConsent, "termsVersion" | "termsUrl" | "privacyVersion" | "privacyUrl">, acceptedAt: string): RegistrationPolicyConsent {
    return { ...policy, acceptedAt };
}

export function normalizeRegistrationPolicyConsent(value: unknown): RegistrationPolicyConsent | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const consent = value as Record<string, unknown>;
    const termsVersion = text(consent.termsVersion);
    const termsUrl = text(consent.termsUrl);
    const privacyVersion = text(consent.privacyVersion);
    const privacyUrl = text(consent.privacyUrl);
    const acceptedAt = text(consent.acceptedAt);
    if (!termsVersion || !termsUrl || !privacyVersion || !privacyUrl || !acceptedAt || !Number.isFinite(Date.parse(acceptedAt))) return undefined;
    return { termsVersion, termsUrl, privacyVersion, privacyUrl, acceptedAt: new Date(acceptedAt).toISOString() };
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
