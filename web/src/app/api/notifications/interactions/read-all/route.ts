import { unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";
import { getCurrentUser } from "@/lib/auth/session";
import { markAllUserNotificationsRead } from "@/lib/server/work-community-service";
import { checkRateLimit, rateLimitHeaders } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const rate = await checkRateLimit(`interaction-notification-read-all:${user.id}`, { maxRequests: 10, windowMs: 60_000 });
    if (!rate.allowed) return Response.json({ code: 429, data: null, msg: "操作过于频繁，请稍后再试" }, { status: 429, headers: rateLimitHeaders(rate) });
    try {
        return workPublicationOk(await markAllUserNotificationsRead(user.id), "互动通知已全部设为已读");
    } catch (error) {
        return workPublicationError(error, "更新通知失败", "Read all interaction notifications failed");
    }
}
