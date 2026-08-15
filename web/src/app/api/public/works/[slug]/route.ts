import { getPublicWorkPublication } from "@/lib/server/work-publication-service";
import { workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: Context) {
    try {
        return workPublicationOk({ work: await getPublicWorkPublication((await context.params).slug) });
    } catch (error) {
        return workPublicationError(error, "获取公开作品失败", "Get public work failed");
    }
}
