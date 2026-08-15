import { hasAdminPermission } from "@/lib/admin-permissions";
import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { listWorkPublicationsForAdmin } from "@/lib/server/work-publication-service";
import { forbidden, unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!hasAdminPermission(user, "content.manage")) return forbidden();
    try {
        const params = request.nextUrl.searchParams;
        const works = await listWorkPublicationsForAdmin({
            page: Number(params.get("page")) || 1,
            pageSize: Number(params.get("pageSize")) || 20,
            status: params.get("status"),
            lifecycleStatus: params.get("lifecycleStatus"),
            keyword: params.get("keyword"),
        });
        return workPublicationOk(works);
    } catch (error) {
        return workPublicationError(error, "获取作品审核列表失败", "List admin works failed");
    }
}
