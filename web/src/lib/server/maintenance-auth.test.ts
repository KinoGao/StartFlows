import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { authorizedWorkerUserId, isAuthorizedMaintenanceRequest, isAuthorizedWorkerRequest, isWorkerTokenConfigured, maintenanceWorkerContext, maintenanceWorkerContextHeaders } from "./maintenance-auth";

const maintenanceToken = "maintenance-token-0123456789abcdef";
const workerToken = "worker-token-0123456789abcdef0123";

describe("maintenance and worker authentication", () => {
    beforeEach(() => {
        vi.stubEnv("VOZEB_PRO_MAINTENANCE_TOKEN", maintenanceToken);
        vi.stubEnv("VOZEB_PRO_WORKER_TOKEN", workerToken);
    });

    afterEach(() => vi.unstubAllEnvs());

    it("keeps external maintenance access separate from Worker access", () => {
        const maintenanceRequest = request(maintenanceToken, "user-one");
        const workerRequest = request(workerToken, "user-one");

        expect(isAuthorizedMaintenanceRequest(maintenanceRequest)).toBe(true);
        expect(isAuthorizedWorkerRequest(maintenanceRequest)).toBe(false);
        expect(authorizedWorkerUserId(maintenanceRequest)).toBe("");
        expect(isAuthorizedWorkerRequest(workerRequest)).toBe(true);
        expect(authorizedWorkerUserId(workerRequest)).toBe("user-one");
    });

    it("rejects deployments that reuse the maintenance token for the Worker", () => {
        vi.stubEnv("VOZEB_PRO_WORKER_TOKEN", maintenanceToken);

        expect(isWorkerTokenConfigured()).toBe(false);
        expect(isAuthorizedWorkerRequest(request(maintenanceToken, "user-one"))).toBe(false);
    });

    it("round-trips a signed per-user Worker context and rejects tampering", () => {
        const context = maintenanceWorkerContext("user-one");
        const headers = maintenanceWorkerContextHeaders(context);

        expect(headers).toEqual({ authorization: `Bearer ${workerToken}`, "x-vozeb-pro-worker-user-id": "user-one" });
        expect(maintenanceWorkerContextHeaders(`${context}tampered`)).toBeNull();
    });
});

function request(token: string, userId: string) {
    return new Request("http://localhost", { headers: { authorization: `Bearer ${token}`, "x-vozeb-pro-worker-user-id": userId } });
}
