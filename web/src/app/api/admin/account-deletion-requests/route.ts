import { hasAdminPermission } from "@/lib/admin-permissions";
import { apiError, apiSuccess } from "@/app/api/_shared/api-response";

import { ACCOUNT_DELETION_REQUEST_STATUSES, type AccountDeletionRequestStatus } from "@/lib/account-deletion-contract";
import { getCurrentUser } from "@/lib/auth/session";
import { listAdminAccountDeletionRequests } from "@/lib/server/account-deletion-request-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return apiError(401, "请先登录");
    if (!hasAdminPermission(currentUser, "users.manage")) return apiError(403, "需要管理员权限");

    const params = new URL(request.url).searchParams;
    const statusValue = params.get("status");
    const status = ACCOUNT_DELETION_REQUEST_STATUSES.includes(statusValue as AccountDeletionRequestStatus) ? (statusValue as AccountDeletionRequestStatus) : undefined;
    const data = await listAdminAccountDeletionRequests({
        page: Number(params.get("page") || 1),
        pageSize: Number(params.get("pageSize") || 20),
        keyword: params.get("keyword") || "",
        status,
    });
    return apiSuccess(data, "OK", { headers: { "Cache-Control": "private, no-store" } });
}
