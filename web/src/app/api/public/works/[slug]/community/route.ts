import type { NextRequest } from "next/server";

import { workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";
import { getCurrentUser } from "@/lib/auth/session";
import { getWorkCommunitySummary } from "@/lib/server/work-community-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, context: Context) {
    try {
        const user = await getCurrentUser();
        return workPublicationOk(await getWorkCommunitySummary((await context.params).slug, user?.id));
    } catch (error) {
        return workPublicationError(error, "获取作品互动信息失败", "Get work community summary failed");
    }
}
