import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getCreateWorkbenchOverview } from "@/lib/server/create-workbench-overview-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    return NextResponse.json({ code: 0, data: { overview: await getCreateWorkbenchOverview(user.id) }, msg: "OK" });
}
