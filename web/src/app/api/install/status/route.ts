import { NextResponse } from "next/server";

import { getInstallStatus } from "@/lib/server/install-status";

export const runtime = "nodejs";

export async function GET() {
    const install = await getInstallStatus();
    if (install.ready) {
        return NextResponse.json({ install: { ready: true } });
    }
    return NextResponse.json({ install });
}
