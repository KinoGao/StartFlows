import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    checkRateLimit: vi.fn(),
    recordReferralVisit: vi.fn(),
}));

vi.mock("@/lib/server/referral-service", () => ({
    normalizeReferralCode: vi.fn((value: unknown) =>
        String(value || "")
            .trim()
            .toUpperCase(),
    ),
    recordReferralVisit: mocks.recordReferralVisit,
    REFERRAL_COOKIE_NAME: "vozeb_referral",
}));
vi.mock("@/lib/server/security", () => ({
    checkRateLimit: mocks.checkRateLimit,
    getClientIp: vi.fn(() => "203.0.113.9"),
    getTrustedProxyHops: vi.fn(() => Number(process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS || 0)),
}));

import { GET } from "./route";

describe("GET /invite/[code]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3000");
        vi.stubEnv("VOZEB_PRO_TRUSTED_PROXY_HOPS", "0");
        mocks.recordReferralVisit.mockResolvedValue({ code: "INVITE88" });
    });

    afterEach(() => vi.unstubAllEnvs());

    it("keeps valid attribution without counting a rate-limited click", async () => {
        mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false }).mockResolvedValueOnce({ allowed: true });
        const request = new NextRequest("http://localhost/invite/INVITE88?next=/gallery/work-one");

        const response = await GET(request, { params: Promise.resolve({ code: "INVITE88" }) });

        expect(mocks.recordReferralVisit).toHaveBeenCalledWith("INVITE88", { countClick: false });
        expect(response.headers.get("location")).toBe("http://localhost/register?next=%2Fgallery%2Fwork-one&ref=INVITE88");
        expect(response.headers.get("set-cookie")).toContain("vozeb_referral=INVITE88");
    });

    it("redirects to the current IP when the configured site URL is loopback", async () => {
        mocks.checkRateLimit.mockResolvedValue({ allowed: true });
        const request = new NextRequest("http://192.168.1.20:3000/invite/INVITE88");

        const response = await GET(request, { params: Promise.resolve({ code: "INVITE88" }) });

        expect(response.headers.get("location")).toBe("http://192.168.1.20:3000/register?ref=INVITE88");
    });

    it("redirects to the forwarded HTTPS domain behind a trusted proxy", async () => {
        vi.stubEnv("VOZEB_PRO_TRUSTED_PROXY_HOPS", "1");
        mocks.checkRateLimit.mockResolvedValue({ allowed: true });
        const request = new NextRequest("http://127.0.0.1:3000/invite/INVITE88", {
            headers: { host: "127.0.0.1:3000", "x-forwarded-host": "vozeb.example.com", "x-forwarded-proto": "https" },
        });

        const response = await GET(request, { params: Promise.resolve({ code: "INVITE88" }) });

        expect(response.headers.get("location")).toBe("https://vozeb.example.com/register?ref=INVITE88");
        expect(response.headers.get("set-cookie")).toContain("Secure");
    });
});
