import { beforeEach, describe, expect, it, vi } from "vitest";

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({ useQuery: useQueryMock }));
vi.mock("@/services/api/announcements", () => ({ fetchAnnouncements: vi.fn() }));

import { useAnnouncements } from "./use-announcements";

describe("useAnnouncements", () => {
    beforeEach(() => useQueryMock.mockReset().mockReturnValue({ data: [] }));

    it("can disable the popup query on unrelated public pages", () => {
        useAnnouncements({ enabled: false });
        expect(useQueryMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, staleTime: 60_000 }));
    });

    it("keeps the notification center query enabled by default", () => {
        useAnnouncements();
        expect(useQueryMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });
});
