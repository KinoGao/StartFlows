import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { CreativeRuntimeServiceError, listAssetsForUser } from "@/lib/server/creative-runtime-service";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const assets = await listAssetsForUser(user.id, (await params).id);
        return NextResponse.json({ code: 0, data: { assets }, msg: "OK" });
    } catch (error) {
        if (error instanceof CreativeRuntimeServiceError) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
        throw error;
    }
}
