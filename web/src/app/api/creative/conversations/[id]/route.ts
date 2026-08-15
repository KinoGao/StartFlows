import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { CreativeRuntimeServiceError, deleteConversationsForUser, getConversationForUser, updateConversationForUser } from "@/lib/server/creative-runtime-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const id = (await params).id;
        const conversation = await getConversationForUser(user.id, id);
        return NextResponse.json({ code: 0, data: { conversation }, msg: "OK" });
    } catch (error) {
        return serviceError(error);
    }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const conversation = await updateConversationForUser(user.id, (await params).id, await readJsonBody<unknown>(request));
        return NextResponse.json({ code: 0, data: { conversation }, msg: "OK" });
    } catch (error) {
        return serviceError(error);
    }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const deleted = await deleteConversationsForUser(user.id, [(await params).id]);
        return NextResponse.json({ code: 0, data: { deleted: deleted > 0 }, msg: deleted ? "创作会话已删除" : "创作会话不存在" });
    } catch (error) {
        return serviceError(error);
    }
}

function serviceError(error: unknown) {
    if (error instanceof CreativeRuntimeServiceError) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
    throw error;
}
