import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { submitWorkPublication } from "@/lib/server/work-publication-service";
import { unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const { id } = await context.params;
    try {
        const work = await submitWorkPublication(user.id, id);
        await safeRecordAuditLog({
            action: "work.publication.submit",
            actor: auditActorFromRequest(request, user),
            target: { type: "published_work", id: work.id, label: work.currentVersion?.title },
            metadata: { version: work.currentVersion?.versionNumber },
        });
        return workPublicationOk({ work }, "作品已提交审核");
    } catch (error) {
        await safeRecordAuditLog({ action: "work.publication.submit", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "published_work", id }, metadata: { error: error instanceof Error ? error.message : "unknown" } });
        return workPublicationError(error, "提交作品失败", "Submit work publication failed");
    }
}
