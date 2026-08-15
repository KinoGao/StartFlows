import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
    return NextResponse.json({ code: 0, data: { status: "live" }, msg: "服务运行中" }, { headers: { "cache-control": "no-store" } });
}
