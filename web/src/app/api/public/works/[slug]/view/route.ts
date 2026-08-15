import { NextResponse } from "next/server";

import { checkRateLimit, getClientIp, rateLimitHeaders } from "@/lib/server/security";
import { recordPublicWorkPublicationView } from "@/lib/server/work-publication-service";
import { workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, context: Context) {
    const { slug } = await context.params;
    const rate = await checkRateLimit(`public-work-view:${slug}:${getClientIp(request)}`, { maxRequests: 10, windowMs: 60_000 });
    if (!rate.allowed) return NextResponse.json({ code: 429, data: null, msg: "访问记录过于频繁" }, { status: 429, headers: rateLimitHeaders(rate) });
    try {
        return workPublicationOk({ viewCount: await recordPublicWorkPublicationView(slug) });
    } catch (error) {
        return workPublicationError(error, "记录作品访问失败", "Record public work view failed");
    }
}
