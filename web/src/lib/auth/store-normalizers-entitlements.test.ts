import { describe, expect, it } from "vitest";

import { normalizeEntitlementSettings } from "./store-normalizers";
import type { EntitlementPlan } from "./store-types";

describe("entitlement settings normalization", () => {
    it("preserves every configured plan beyond the former platform ceiling", () => {
        const plans: EntitlementPlan[] = Array.from({ length: 25 }, (_, index) => ({
            id: `plan-${index}`,
            name: `套餐 ${index}`,
            enabled: true,
            dailyPoints: index,
            limits: { dailyPointSpend: 0, dailyApiCalls: 0, dailyImages: 0, dailyVideos: 0, dailyAudio: 0, dailyText: 0 },
            features: [],
        }));

        const result = normalizeEntitlementSettings({ enabled: true, defaultPlanId: "plan-24", plans });

        expect(result.plans).toHaveLength(25);
        expect(result.plans.at(-1)?.id).toBe("plan-24");
        expect(result.defaultPlanId).toBe("plan-24");
    });
});
