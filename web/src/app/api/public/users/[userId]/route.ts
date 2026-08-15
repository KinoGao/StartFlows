import type { NextRequest } from "next/server";

import { workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";
import { getCurrentUser } from "@/lib/auth/session";
import { getPublicCreatorPage } from "@/lib/server/work-community-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ userId: string }> };

export async function GET(request: NextRequest, context: Context) {
    const [viewer, params] = await Promise.all([getCurrentUser(), context.params]);
    try {
        return workPublicationOk(
            await getPublicCreatorPage(params.userId, viewer?.id, {
                limit: Number(request.nextUrl.searchParams.get("limit")) || 18,
                cursor: request.nextUrl.searchParams.get("cursor"),
            }),
        );
    } catch (error) {
        return workPublicationError(error, "获取创作者主页失败", "Get public creator profile failed");
    }
}
