import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { DramaProjectServiceError, restoreDramaProjectVersionForUser } from "@/lib/server/drama-project-service";

type Context = { params: Promise<{ id: string; versionId: string }> };

export async function POST(_: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id, versionId } = await context.params;
        const project = await restoreDramaProjectVersionForUser(user.id, id, versionId);
        return NextResponse.json({ code: 0, data: { project }, msg: "短剧版本已恢复" });
    } catch (error) {
        if (error instanceof DramaProjectServiceError) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
        throw error;
    }
}
