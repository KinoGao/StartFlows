import { NextRequest, NextResponse } from "next/server";

import { readJsonBodyResult } from "@/lib/auth/request";
import { initializeInstallDatabase, InstallInitializationError } from "@/lib/server/install-status";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    try {
        const parsed = await readJsonBodyResult<{ installToken?: unknown }>(request, 64 * 1024);
        if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });
        const body = parsed.data;
        const install = await initializeInstallDatabase(body.installToken);
        return NextResponse.json({ code: 0, data: { install }, msg: "数据库初始化完成" });
    } catch (error) {
        if (error instanceof InstallInitializationError) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
        console.error("Install initialization route failed", error);
        return NextResponse.json({ code: 500, data: null, msg: "数据库初始化失败" }, { status: 500 });
    }
}
