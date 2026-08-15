import { describe, expect, it } from "vitest";

import { formatCdkCodeForDisplay, generateCdkPlainCode, normalizeCdkCode } from "./store-normalizers";

describe("CDK identity", () => {
    it("derives the complete code from its stable UUID without collision retries", () => {
        const code = generateCdkPlainCode("123e4567-e89b-42d3-a456-426614174000");

        expect(code).toBe("VZ-123E4567-E89B42D3-A4564266-14174000");
        expect(normalizeCdkCode(code)).toBe("VZ123E4567E89B42D3A456426614174000");
        expect(formatCdkCodeForDisplay(code)).toBe(code);
    });
});
