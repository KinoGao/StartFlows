import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { isAuthInputError } from "@/lib/auth/store";
import { readJsonBody } from "@/lib/auth/request";
import { createPrompt, listPrompts, type PromptInput } from "@/lib/prompts/store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const params = request.nextUrl.searchParams;
    const result = await listPrompts({
        scope: "user",
        ownerUserId: currentUser.id,
        keyword: params.get("keyword") || "",
        tags: params.getAll("tag").filter(Boolean),
        category: params.get("category") || "",
        page: Math.max(1, Number(params.get("page")) || 1),
        pageSize: Math.max(1, Math.min(100, Number(params.get("pageSize")) || 20)),
        includeFacets: params.get("includeFacets") !== "0",
    });
    return NextResponse.json(result);
}

export async function POST(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    try {
        const body = await readJsonBody<PromptInput>(request);
        const prompt = await createPrompt("user", body, currentUser.id);
        return NextResponse.json({ prompt });
    } catch (error) {
        if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Create user prompt failed", error);
        return NextResponse.json({ error: "新增提示词失败" }, { status: 500 });
    }
}
