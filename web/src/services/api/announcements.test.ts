import { describe, expect, it } from "vitest";

import { parseAnnouncementsPayload } from "@/services/api/announcements";

describe("parseAnnouncementsPayload", () => {
    it("normalizes public announcement data", () => {
        expect(
            parseAnnouncementsPayload({
                announcements: [{ id: "notice-1", title: "维护通知", content: "今晚升级", enabled: true, popupHome: true, popupAfterLogin: false, createdAt: "2026-07-22T10:00:00.000Z" }],
            }),
        ).toEqual([
            {
                id: "notice-1",
                title: "维护通知",
                content: "今晚升级",
                enabled: true,
                popupHome: true,
                popupAfterLogin: false,
                startsAt: undefined,
                endsAt: undefined,
                createdAt: "2026-07-22T10:00:00.000Z",
                updatedAt: "2026-07-22T10:00:00.000Z",
            },
        ]);
    });

    it("rejects invalid envelopes and skips invalid rows", () => {
        expect(() => parseAnnouncementsPayload({})).toThrow("公告数据格式错误");
        expect(parseAnnouncementsPayload({ announcements: [null, { id: "missing-fields" }] })).toEqual([]);
    });
});
