import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { deleteWorkPublicationForUser, getWorkPublicationForUser, updateWorkPublicationDraft, type WorkPublicationDraftInput } from "@/lib/server/work-publication-service";
import { unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    try {
        return workPublicationOk({ work: await getWorkPublicationForUser(user.id, (await context.params).id) });
    } catch (error) {
        return workPublicationError(error, "获取作品详情失败", "Get user work failed");
    }
}

export async function PATCH(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const { id } = await context.params;
    try {
        const work = await updateWorkPublicationDraft(user.id, id, await readJsonBody<WorkPublicationDraftInput>(request));
        await safeRecordAuditLog({
            action: "work.publication.update",
            actor: auditActorFromRequest(request, user),
            target: { type: "published_work", id: work.id, label: work.currentVersion?.title },
            metadata: { version: work.currentVersion?.versionNumber, visibility: work.currentVersion?.visibility },
        });
        return workPublicationOk({ work }, "作品草稿已保存");
    } catch (error) {
        await safeRecordAuditLog({ action: "work.publication.update", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "published_work", id }, metadata: { error: error instanceof Error ? error.message : "unknown" } });
        return workPublicationError(error, "保存作品失败", "Update work publication failed");
    }
}

export async function DELETE(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const { id } = await context.params;
    try {
        const deleted = await deleteWorkPublicationForUser(user.id, id);
        await safeRecordAuditLog({ action: "work.publication.delete", actor: auditActorFromRequest(request, user), target: { type: "published_work", id: deleted.id, label: deleted.title } });
        return workPublicationOk({ deletedId: deleted.id }, "作品已删除");
    } catch (error) {
        await safeRecordAuditLog({ action: "work.publication.delete", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "published_work", id }, metadata: { error: error instanceof Error ? error.message : "unknown" } });
        return workPublicationError(error, "删除作品失败", "Delete work publication failed");
    }
}
