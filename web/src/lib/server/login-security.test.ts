import { describe, expect, it } from "vitest";

import { loginSecurityNoticeFrom } from "./audit-log-store";

const previous = {
    id: "login-one",
    ip: "203.0.113.10",
    userAgent: "Browser A",
    createdAt: "2026-08-09T10:00:00.000Z",
};

describe("login security notice", () => {
    it("does not warn on the first login or an unchanged environment", () => {
        expect(loginSecurityNoticeFrom(undefined, { ip: previous.ip, userAgent: previous.userAgent })).toBeUndefined();
        expect(loginSecurityNoticeFrom(previous, { ip: previous.ip, userAgent: previous.userAgent })).toBeUndefined();
    });

    it("reports exact device and network changes without a time window", () => {
        expect(loginSecurityNoticeFrom(previous, { ip: "203.0.113.11", userAgent: "Browser B" })).toEqual({
            networkChanged: true,
            deviceChanged: true,
            previousLoginAt: previous.createdAt,
        });
    });

    it("does not claim a change when either side lacks comparable data", () => {
        expect(loginSecurityNoticeFrom({ ...previous, ip: undefined }, { ip: "203.0.113.11", userAgent: previous.userAgent })).toBeUndefined();
    });
});
