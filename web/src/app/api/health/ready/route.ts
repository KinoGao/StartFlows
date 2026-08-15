import { NextResponse } from "next/server";

import { getInstallStatus } from "@/lib/server/install-status";
import { getGenerationWorkerHealth } from "@/lib/server/generation-worker-heartbeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const install = await getInstallStatus();
        const generationWorker = install.database.schemaReady ? await getGenerationWorkerHealth() : { required: true, healthy: false, lastHeartbeatAt: null, reason: "installation_pending" as const };
        const ready = install.ready && generationWorker.healthy;
        const data = {
            ready,
            provider: install.provider,
            database: { healthy: install.database.healthy, schemaReady: install.database.schemaReady },
            encryptionReady: install.security.encryptionReady,
            firstAdminRequired: install.firstAdminRequired,
            generationWorker,
        };
        return NextResponse.json({ code: ready ? 0 : 503, data, msg: ready ? "服务已就绪" : "服务尚未就绪" }, { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } });
    } catch (error) {
        console.error("Readiness check failed", error);
        return NextResponse.json({ code: 503, data: { ready: false }, msg: "服务尚未就绪" }, { status: 503, headers: { "cache-control": "no-store" } });
    }
}
