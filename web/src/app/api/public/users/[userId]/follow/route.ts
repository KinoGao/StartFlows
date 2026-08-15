import { unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { setPublicCreatorFollow } from "@/lib/server/work-community-service";
import { checkRateLimit, rateLimitHeaders } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ userId: string }> };

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const rate = await checkRateLimit(`creator-follow:${user.id}`, { maxRequests: 30, windowMs: 60_000 });
    if (!rate.allowed) return Response.json({ code: 429, data: null, msg: "操作过于频繁，请稍后再试" }, { status: 429, headers: rateLimitHeaders(rate) });
    const body = await readJsonBody<{ active?: unknown }>(request);
    try {
        return workPublicationOk(await setPublicCreatorFollow(user.id, (await context.params).userId, body.active), body.active === false ? "已取消关注" : "已关注作者");
    } catch (error) {
        return workPublicationError(error, "关注操作失败", "Toggle creator follow failed");
    }
}
