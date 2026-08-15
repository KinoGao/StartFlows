import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getReferralCenter: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/referral-service", () => ({ getReferralCenter: mocks.getReferralCenter }));

import { GET } from "./route";

describe("GET /api/referrals", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3000");
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.getReferralCenter.mockResolvedValue({ code: "INVITE88", link: "http://192.168.1.20:3000/invite/INVITE88" });
    });

    afterEach(() => vi.unstubAllEnvs());

    it("builds the share link from the current public IP instead of a loopback setting", async () => {
        const response = await GET(new Request("http://192.168.1.20:3000/api/referrals?referralsPage=2&rewardsPage=3&pageSize=8"));

        expect(response.status).toBe(200);
        expect(mocks.getReferralCenter).toHaveBeenCalledWith("user-one", "http://192.168.1.20:3000", { referralsPage: "2", rewardsPage: "3", pageSize: "8" });
    });
});
