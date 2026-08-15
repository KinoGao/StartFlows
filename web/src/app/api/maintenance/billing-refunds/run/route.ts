import { apiError, apiSuccess } from "@/app/api/_shared/api-response";
import { runBillingRefundReconciliationBatch } from "@/lib/server/billing-refund-orchestration-service";
import { getDatabaseProvider } from "@/lib/server/database";
import { getInstallStatus } from "@/lib/server/install-status";
import { isAuthorizedWorkerRequest, isWorkerTokenConfigured } from "@/lib/server/maintenance-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    if (!isWorkerTokenConfigured()) return apiError(503, "Worker 令牌未配置或未与维护令牌分离");
    if (!isAuthorizedWorkerRequest(request)) return apiError(401, "Worker 认证失败");
    const workerId = request.headers.get("x-vozeb-pro-worker-id")?.trim() || "";
    if (!workerId) return apiError(400, "退款 Worker ID 不能为空");
    try {
        if (getDatabaseProvider() !== "postgres") return apiSuccess({ claimed: 0 }, "当前存储模式无需处理退款补偿任务");
        if (!(await getInstallStatus()).database.schemaReady) return apiSuccess({ claimed: 0 }, "等待初始化数据库");
        const result = await runBillingRefundReconciliationBatch({ workerId, limit: 10 });
        return apiSuccess(result, result.claimed ? `已处理 ${result.claimed} 个退款补偿任务` : "没有到期的退款补偿任务");
    } catch (error) {
        console.error("Billing refund reconciliation batch failed", { workerId, error });
        return apiError(500, "退款补偿任务执行失败");
    }
}
