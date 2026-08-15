import { hasAdminPermission } from "@/lib/admin-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { deleteWorkPublicationForAdmin } from "@/lib/server/work-publication-service";
import { forbidden, unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!hasAdminPermission(user, "content.manage")) return forbidden();
    const { id } = await context.params;
    try {
        const deleted = await deleteWorkPublicationForAdmin(user.id, id);
        await safeRecordAuditLog({ action: "admin.work.delete", actor: auditActorFromRequest(request, user), target: { type: "published_work", id: deleted.id, label: deleted.title } });
        return workPublicationOk({ deletedId: deleted.id }, "作品已删除");
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.work.delete", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "published_work", id }, metadata: { error: error instanceof Error ? error.message : "unknown" } });
        return workPublicationError(error, "删除作品失败", "Delete work publication failed");
    }
}
