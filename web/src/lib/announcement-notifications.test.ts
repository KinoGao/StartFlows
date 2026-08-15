import { describe, expect, it } from "vitest";

import { formatAnnouncementTime, mergeAnnouncementReadIds, parseAnnouncementReadIds } from "@/lib/announcement-notifications";

describe("announcement notifications", () => {
    it("parses stored read ids safely", () => {
        expect([...parseAnnouncementReadIds('["a","b",3]')]).toEqual(["a", "b"]);
        expect([...parseAnnouncementReadIds("broken")]).toEqual([]);
    });

    it("merges read ids without duplicates", () => {
        expect([...mergeAnnouncementReadIds(new Set(["a"]), ["a", "b"])]).toEqual(["a", "b"]);
    });

    it("formats recent announcement times", () => {
        const now = new Date("2026-07-22T12:00:00.000Z").getTime();
        expect(formatAnnouncementTime("2026-07-22T11:58:00.000Z", now)).toBe("2 分钟前");
        expect(formatAnnouncementTime("2026-07-22T09:00:00.000Z", now)).toBe("3 小时前");
        expect(formatAnnouncementTime("2026-07-20T12:00:00.000Z", now)).toBe("2 天前");
    });
});
