import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getWorkPublicationSource, listWorkPublicationSources } from "@/lib/server/work-publication-service";
import { unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    try {
        const sourceType = request.nextUrl.searchParams.get("sourceType");
        const sourceId = request.nextUrl.searchParams.get("sourceId");
        if (sourceId) return workPublicationOk({ source: await getWorkPublicationSource(user.id, sourceType, sourceId) });
        return workPublicationOk(
            await listWorkPublicationSources(user.id, {
                sourceType,
                page: Number(request.nextUrl.searchParams.get("page")) || 1,
                pageSize: Number(request.nextUrl.searchParams.get("pageSize")) || undefined,
                keyword: request.nextUrl.searchParams.get("keyword"),
            }),
        );
    } catch (error) {
        return workPublicationError(error, "获取可发布来源失败", "List work publication sources failed");
    }
}
