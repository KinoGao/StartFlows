import { describe, expect, it } from "vitest";

import { apiCompatError, apiError, apiSuccess } from "./api-response";

describe("API response helpers", () => {
    it("creates the shared success envelope", async () => {
        const response = apiSuccess({ id: "one" }, "已创建", { status: 201 });

        expect(response.status).toBe(201);
        await expect(response.json()).resolves.toEqual({ code: 0, data: { id: "one" }, msg: "已创建" });
    });

    it("supports strict and legacy-compatible error envelopes", async () => {
        await expect(apiError(403, "需要管理员权限").json()).resolves.toEqual({ code: 403, data: null, msg: "需要管理员权限" });
        await expect(apiCompatError(400, "输入有误").json()).resolves.toEqual({ code: 400, data: null, msg: "输入有误", error: "输入有误" });
    });
});
