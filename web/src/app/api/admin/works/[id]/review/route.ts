import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { reviewWorkPublication } from "@/lib/server/work-publication-service";
import { forbidden, unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
type ReviewBody = { versionId?: unknown; decision?: unknown; reason?: unknown };

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!hasAdminPermission(user, "content.manage")) return forbidden();
    const { id } = await context.params;
    const body = await readJsonBody<ReviewBody>(request);
    try {
        const work = await reviewWorkPublication({ reviewerUserId: user.id, workId: id, versionId: body.versionId, decision: body.decision, reason: body.reason });
        await safeRecordAuditLog({
            action: body.decision === "approved" ? "admin.work.approve" : "admin.work.reject",
            actor: auditActorFromRequest(request, user),
            target: { type: "published_work", id: work.id, label: work.currentVersion?.title },
            metadata: { versionId: body.versionId, reason: body.decision === "rejected" ? body.reason : undefined },
        });
        return workPublicationOk({ work }, body.decision === "approved" ? "作品已通过审核" : "作品已驳回");
    } catch (error) {
        await safeRecordAuditLog({
            action: body.decision === "approved" ? "admin.work.approve" : "admin.work.reject",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "published_work", id },
            metadata: { versionId: body.versionId, error: error instanceof Error ? error.message : "unknown" },
        });
        return workPublicationError(error, "审核作品失败", "Review work publication failed");
    }
}
