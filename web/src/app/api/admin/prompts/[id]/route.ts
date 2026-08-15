import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { isAuthInputError } from "@/lib/auth/store";
import { readJsonBody } from "@/lib/auth/request";
import { deletePrompt, updatePrompt, type PromptInput } from "@/lib/prompts/store";

export const runtime = "nodejs";

type RouteContext = {
    params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "content.manage")) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    try {
        const { id } = await context.params;
        const body = await readJsonBody<PromptInput>(request);
        const prompt = await updatePrompt(id, body, { scope: "library" });
        return NextResponse.json({ prompt });
    } catch (error) {
        if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Update admin prompt failed", error);
        return NextResponse.json({ error: "更新提示词失败" }, { status: 500 });
    }
}

export async function DELETE(_request: Request, context: RouteContext) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "content.manage")) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    try {
        const { id } = await context.params;
        await deletePrompt(id, { scope: "library" });
        return NextResponse.json({ ok: true });
    } catch (error) {
        if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Delete admin prompt failed", error);
        return NextResponse.json({ error: "删除提示词失败" }, { status: 500 });
    }
}
