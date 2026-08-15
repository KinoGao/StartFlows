import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { ffmpegAvailable } from "@/lib/server/ffmpeg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    const available = await ffmpegAvailable();
    return NextResponse.json({ code: 0, data: { available }, msg: available ? "FFmpeg 已就绪" : "当前服务器未安装 FFmpeg" });
}
