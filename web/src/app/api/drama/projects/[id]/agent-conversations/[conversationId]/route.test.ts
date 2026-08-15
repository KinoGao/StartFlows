import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), remove: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/drama-project-service", () => ({
    DramaProjectServiceError: class DramaProjectServiceError extends Error {
        constructor(
            message: string,
            readonly status: number,
        ) {
            super(message);
        }
    },
    deleteDramaAgentConversationForUser: mocks.remove,
}));

import { DELETE } from "./route";

describe("Drama Agent conversation deletion route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.remove.mockResolvedValue({ deleted: true, activeConversationId: "conversation-two", project: { id: "drama-one", creativeConversationId: "conversation-two" } });
    });

    it("passes project and conversation identities to the scoped service", async () => {
        const response = await DELETE(new Request("http://localhost/api/drama/projects/drama-one/agent-conversations/conversation-one", { method: "DELETE" }), context());

        expect(mocks.remove).toHaveBeenCalledWith("user-one", "drama-one", "conversation-one");
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { deleted: true, activeConversationId: "conversation-two" } });
    });

    it("requires authentication", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);

        const response = await DELETE(new Request("http://localhost/api/drama/projects/drama-one/agent-conversations/conversation-one", { method: "DELETE" }), context());

        expect(response.status).toBe(401);
        expect(mocks.remove).not.toHaveBeenCalled();
    });
});

function context() {
    return { params: Promise.resolve({ id: "drama-one", conversationId: "conversation-one" }) };
}
