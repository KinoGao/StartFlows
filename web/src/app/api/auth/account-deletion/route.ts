import { apiError, apiSuccess } from "@/app/api/_shared/api-response";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { isAuthInputError } from "@/lib/auth/store";
import { AccountDeletionRequestError, getOwnAccountDeletionRequest, submitAccountDeletionRequest, withdrawOwnAccountDeletionRequest } from "@/lib/server/account-deletion-request-service";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { checkRateLimit, rateLimitHeaders } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const currentUser = await getCurrentUser();
    if (!currentUser) return apiError(401, "请先登录");
    return apiSuccess(await getOwnAccountDeletionRequest(currentUser.id), "OK", { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return apiError(401, "请先登录");
    const limit = await checkRateLimit(`account-deletion-submit:${currentUser.id}`, { maxRequests: 5, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return apiError(429, "操作过于频繁，请稍后再试", { headers: rateLimitHeaders(limit) });

    try {
        const body = await readJsonBody<{ currentPassword?: unknown; note?: unknown }>(request);
        const data = await submitAccountDeletionRequest(currentUser, {
            currentPassword: typeof body.currentPassword === "string" ? body.currentPassword : "",
            note: typeof body.note === "string" ? body.note : "",
        });
        await safeRecordAuditLog({
            action: "account.deletion.submit",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "account_deletion_request", id: data.id, label: currentUser.username },
        });
        return apiSuccess(data, "注销申请已提交");
    } catch (error) {
        const mapped = mapError(error, "注销申请提交失败");
        return apiError(mapped.status, mapped.message);
    }
}

export async function DELETE(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return apiError(401, "请先登录");
    try {
        const data = await withdrawOwnAccountDeletionRequest(currentUser.id);
        await safeRecordAuditLog({
            action: "account.deletion.withdraw",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "account_deletion_request", id: data.id, label: currentUser.username },
        });
        return apiSuccess(data, "注销申请已撤回");
    } catch (error) {
        const mapped = mapError(error, "注销申请撤回失败");
        return apiError(mapped.status, mapped.message);
    }
}

function mapError(error: unknown, fallback: string) {
    if (error instanceof AccountDeletionRequestError || isAuthInputError(error)) return { status: error.status, message: error.message };
    console.error(fallback, error);
    return { status: 500, message: fallback };
}
