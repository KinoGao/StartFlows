import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { CreativeRuntimeServiceError, listMessagesForUser } from "@/lib/server/creative-runtime-service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const url = new URL(request.url);
        const messages = await listMessagesForUser(user.id, (await params).id, Number(url.searchParams.get("afterSequence")) || 0, Number(url.searchParams.get("limit")) || 100, Number(url.searchParams.get("beforeSequence")) || 0);
        return NextResponse.json({ code: 0, data: { messages }, msg: "OK" });
    } catch (error) {
        if (error instanceof CreativeRuntimeServiceError) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
        throw error;
    }
}
