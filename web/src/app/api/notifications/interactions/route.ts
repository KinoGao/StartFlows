import type { NextRequest } from "next/server";

import { unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";
import { getCurrentUser } from "@/lib/auth/session";
import { listUserNotifications } from "@/lib/server/work-community-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    try {
        return workPublicationOk(
            await listUserNotifications(user.id, {
                limit: Number(request.nextUrl.searchParams.get("limit")) || 20,
                cursor: request.nextUrl.searchParams.get("cursor"),
            }),
        );
    } catch (error) {
        return workPublicationError(error, "获取互动通知失败", "List interaction notifications failed");
    }
}
