import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    provider: "postgres" as "postgres" | "file",
    readFile: vi.fn(),
    writeFile: vi.fn(),
    ensureSchema: vi.fn(),
    query: vi.fn(),
}));

vi.mock("@/lib/server/data-adapter", () => ({ readJsonDataFile: mocks.readFile, writeJsonDataFile: mocks.writeFile }));
vi.mock("@/lib/server/database/postgres", () => ({
    getDatabaseProvider: vi.fn(() => mocks.provider),
    ensurePostgresSchema: mocks.ensureSchema,
    postgresQuery: mocks.query,
}));

import { createAccountDeletionRequest, listAccountDeletionRequests, withdrawPendingAccountDeletionRequest } from "./account-deletion-request-repository";

const request = {
    id: "request-one",
    userId: "user-one",
    accountId: "0001",
    username: "creator",
    displayName: "创作者",
    email: "creator@example.com",
    status: "pending" as const,
    note: "",
    reviewNote: "",
    requestedAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
};

describe("account deletion request repository", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.provider = "postgres";
        mocks.query.mockResolvedValue({ rows: [{ ...request, user_id: request.userId, account_id: 1, username_snapshot: request.username, display_name_snapshot: request.displayName, requested_at: request.requestedAt, updated_at: request.updatedAt }] });
        mocks.readFile.mockResolvedValue({ version: 1, requests: [] });
    });

    it("uses a partial unique conflict guard for PostgreSQL creation", async () => {
        await createAccountDeletionRequest(request);

        expect(mocks.ensureSchema).toHaveBeenCalledTimes(1);
        expect(mocks.query.mock.calls[0][0]).toContain("ON CONFLICT (user_id) WHERE status = 'pending' DO NOTHING");
        expect(mocks.query.mock.calls[0][1]).toContain("user-one");
    });

    it("filters before PostgreSQL pagination", async () => {
        await listAccountDeletionRequests({ page: 2, pageSize: 10, keyword: "creator", status: "pending" });

        expect(mocks.query.mock.calls[0][0]).toContain("WHERE ($1 = ''");
        expect(mocks.query.mock.calls[0][0]).toContain("lpad(users.account_id::text, 4, '0') LIKE $2");
        expect(mocks.query.mock.calls[0][1]).toEqual(["creator", "%creator%", "pending", 10, 10]);
    });

    it("prevents duplicate pending requests in the file provider", async () => {
        mocks.provider = "file";
        mocks.readFile.mockResolvedValue({ version: 1, requests: [request] });

        await expect(createAccountDeletionRequest({ ...request, id: "request-two" })).resolves.toBeNull();
        expect(mocks.writeFile).toHaveBeenCalledWith("account-deletion-requests.json", expect.objectContaining({ requests: [expect.objectContaining({ id: "request-one" })] }));
    });

    it("withdraws only a pending request in the file provider", async () => {
        mocks.provider = "file";
        mocks.readFile.mockResolvedValue({ version: 1, requests: [request] });

        const result = await withdrawPendingAccountDeletionRequest("user-one", "2026-07-25T01:00:00.000Z");

        expect(result).toMatchObject({ status: "withdrawn", handledAt: "2026-07-25T01:00:00.000Z" });
    });
});
