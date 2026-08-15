import { hasAdminPermission } from "@/lib/admin-permissions";
import { forbidden, unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { resolveWorkGovernanceCase } from "@/lib/server/work-governance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!hasAdminPermission(user, "content.manage")) return forbidden();
    const { id } = await context.params;
    const body = await readJsonBody<{ decision?: unknown; resolution?: unknown }>(request);
    try {
        const item = await resolveWorkGovernanceCase({ actorUserId: user.id, caseId: id, decision: body.decision, resolution: body.resolution });
        await safeRecordAuditLog({
            action: "admin.work-governance.resolve",
            actor: auditActorFromRequest(request, user),
            target: { type: "published_work_case", id: item.id },
            metadata: { decision: body.decision, resolution: body.resolution, workId: item.workId, versionId: item.versionId },
        });
        return workPublicationOk({ item }, "治理案件已处理");
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.work-governance.resolve",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "published_work_case", id },
            metadata: { decision: body.decision, error: error instanceof Error ? error.message : "unknown" },
        });
        return workPublicationError(error, "处理举报申诉失败", "Resolve work governance case failed");
    }
}
