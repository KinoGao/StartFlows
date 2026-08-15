import { describe, expect, it } from "vitest";

import { getAlipayPaymentModePresentation, PAYMENT_PROVIDER_DEFINITIONS } from "./payment-config-types";

describe("payment provider definitions", () => {
    it("exposes one mutually exclusive Alipay mode selector", () => {
        const providers = PAYMENT_PROVIDER_DEFINITIONS.filter((provider) => provider.id === "alipay");
        const mode = providers[0]?.fields.find((field) => field.key === "mode");

        expect(providers).toHaveLength(1);
        expect(mode).toMatchObject({ kind: "select", required: true, defaultValue: "official" });
        expect(mode?.options).toEqual([
            { label: "官方支付", value: "official" },
            { label: "当面付", value: "face_to_face" },
        ]);
        expect(providers[0]?.checkoutFieldKeys).toContain("mode");
    });

    it("keeps Alipay mode presentation in the shared payment contract", () => {
        expect(getAlipayPaymentModePresentation("official")).toMatchObject({ checkoutKind: "官方支付表单" });
        expect(getAlipayPaymentModePresentation("face_to_face")).toMatchObject({ checkoutKind: "当面付二维码" });
        expect(getAlipayPaymentModePresentation("both")).toBeUndefined();
    });
});
