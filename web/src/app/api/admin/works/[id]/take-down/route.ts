import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { takeDownWorkPublication } from "@/lib/server/work-publication-service";
import { forbidden, unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!hasAdminPermission(user, "content.manage")) return forbidden();
    const { id } = await context.params;
    const body = await readJsonBody<{ reason?: unknown }>(request);
    try {
        const work = await takeDownWorkPublication({ reviewerUserId: user.id, workId: id, reason: body.reason });
        await safeRecordAuditLog({ action: "admin.work.take-down", actor: auditActorFromRequest(request, user), target: { type: "published_work", id: work.id, label: work.currentVersion?.title }, metadata: { reason: body.reason } });
        return workPublicationOk({ work }, "作品已下架");
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.work.take-down", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "published_work", id }, metadata: { error: error instanceof Error ? error.message : "unknown" } });
        return workPublicationError(error, "下架作品失败", "Take down work publication failed");
    }
}
