import { unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { setPublicUserBlock } from "@/lib/server/work-community-service";
import { checkRateLimit, rateLimitHeaders } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ userId: string }> };

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const rate = await checkRateLimit(`user-block:${user.id}`, { maxRequests: 20, windowMs: 60_000 });
    if (!rate.allowed) return Response.json({ code: 429, data: null, msg: "操作过于频繁，请稍后再试" }, { status: 429, headers: rateLimitHeaders(rate) });
    const target = (await context.params).userId;
    const body = await readJsonBody<{ active?: unknown }>(request);
    try {
        const result = await setPublicUserBlock(user.id, target, body.active);
        await safeRecordAuditLog({
            action: result.active ? "community.user.block" : "community.user.unblock",
            actor: auditActorFromRequest(request, user),
            target: { type: "user", label: target },
            metadata: { removedFollowCount: result.removedFollowCount },
        });
        return workPublicationOk(result, result.active ? "已拉黑用户" : "已取消拉黑");
    } catch (error) {
        return workPublicationError(error, "拉黑操作失败", "Toggle user block failed");
    }
}
