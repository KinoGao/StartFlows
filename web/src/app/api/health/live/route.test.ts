import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("liveness route", () => {
    it("reports that the application process can respond", async () => {
        const response = GET();

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { status: "live" } });
    });
});
