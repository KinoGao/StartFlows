import type { NextRequest } from "next/server";

import { unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";
import { getCurrentUser } from "@/lib/auth/session";
import { listUserCommunityActivity } from "@/lib/server/work-community-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const params = request.nextUrl.searchParams;
    try {
        return workPublicationOk(
            await listUserCommunityActivity(user.id, {
                view: params.get("view"),
                page: Number(params.get("page")) || 1,
                pageSize: Number(params.get("pageSize")) || 12,
            }),
        );
    } catch (error) {
        return workPublicationError(error, "获取社区互动记录失败", "List user community activity failed");
    }
}
