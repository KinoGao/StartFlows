import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getConversationForUser: vi.fn(),
    deleteConversationsForUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/creative-runtime-service", () => ({
    CreativeRuntimeServiceError: class CreativeRuntimeServiceError extends Error {
        constructor(
            message: string,
            public readonly status: number,
        ) {
            super(message);
        }
    },
    getConversationForUser: mocks.getConversationForUser,
    updateConversationForUser: vi.fn(),
    deleteConversationsForUser: mocks.deleteConversationsForUser,
}));

import { DELETE, GET } from "./route";

describe("creative conversation detail route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.getConversationForUser.mockResolvedValue({ id: "conversation-one", title: "会话" });
        mocks.deleteConversationsForUser.mockResolvedValue(1);
    });

    it("deletes one owned conversation instead of archiving it", async () => {
        const response = await DELETE(new Request("http://localhost/api/creative/conversations/conversation-one", { method: "DELETE" }), { params: Promise.resolve({ id: "conversation-one" }) });

        expect(mocks.deleteConversationsForUser).toHaveBeenCalledWith("user-one", ["conversation-one"]);
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { deleted: true } });
    });

    it("loads one owned conversation on demand", async () => {
        const response = await GET(new Request("http://localhost/api/creative/conversations/conversation-one"), { params: Promise.resolve({ id: "conversation-one" }) });
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(mocks.getConversationForUser).toHaveBeenCalledWith("user-one", "conversation-one");
        expect(payload.data.conversation).toEqual(expect.objectContaining({ id: "conversation-one" }));
    });
});
