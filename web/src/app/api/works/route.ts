import type { NextRequest } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { createWorkPublicationDraft, listWorkPublicationsForUser, type WorkPublicationDraftInput } from "@/lib/server/work-publication-service";
import { unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    try {
        const params = request.nextUrl.searchParams;
        const works = await listWorkPublicationsForUser(user.id, {
            page: Number(params.get("page")) || 1,
            pageSize: Number(params.get("pageSize")) || 20,
            status: params.get("status"),
            keyword: params.get("keyword"),
        });
        return workPublicationOk(works);
    } catch (error) {
        return workPublicationError(error, "获取作品失败", "List user works failed");
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    try {
        const work = await createWorkPublicationDraft(user.id, await readJsonBody<WorkPublicationDraftInput>(request));
        await safeRecordAuditLog({
            action: "work.publication.create",
            actor: auditActorFromRequest(request, user),
            target: { type: "published_work", id: work.id, label: work.currentVersion?.title },
            metadata: { sourceType: work.sourceType, visibility: work.currentVersion?.visibility },
        });
        return workPublicationOk({ work }, "作品草稿已创建", 201);
    } catch (error) {
        await safeRecordAuditLog({ action: "work.publication.create", status: "failure", actor: auditActorFromRequest(request, user), metadata: { error: error instanceof Error ? error.message : "unknown" } });
        return workPublicationError(error, "创建作品失败", "Create work publication failed");
    }
}
