import { hasAdminPermission } from "@/lib/admin-permissions";
import { forbidden, unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { setWorkFeatured } from "@/lib/server/work-governance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!hasAdminPermission(user, "content.manage")) return forbidden();
    const { id } = await context.params;
    const body = await readJsonBody<{ featured?: unknown }>(request);
    try {
        const work = await setWorkFeatured({ actorUserId: user.id, workId: id, featured: body.featured });
        await safeRecordAuditLog({
            action: body.featured === true ? "admin.work.feature" : "admin.work.unfeature",
            actor: auditActorFromRequest(request, user),
            target: { type: "published_work", id: work.id },
            metadata: { featured: body.featured === true },
        });
        return workPublicationOk({ work }, body.featured === true ? "作品已设为精选" : "作品已取消精选");
    } catch (error) {
        await safeRecordAuditLog({
            action: body.featured === true ? "admin.work.feature" : "admin.work.unfeature",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "published_work", id },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        return workPublicationError(error, "更新作品精选状态失败", "Update work featured state failed");
    }
}
