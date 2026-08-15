import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

export async function POST() {
    return NextResponse.json({ error: "旧视频任务登记接口已停用，请通过服务端视频生成接口创建任务" }, { status: 410 });
}
