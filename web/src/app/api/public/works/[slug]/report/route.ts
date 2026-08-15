import { workPublicationError, workPublicationOk, unauthorized } from "@/app/api/_shared/work-publication-response";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { submitPublicWorkReport } from "@/lib/server/work-governance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const body = await readJsonBody<{ category?: unknown; description?: unknown }>(request);
    try {
        const item = await submitPublicWorkReport(user.id, (await context.params).slug, body);
        return workPublicationOk({ item }, "举报已提交");
    } catch (error) {
        return workPublicationError(error, "提交举报失败", "Submit work report failed");
    }
}
