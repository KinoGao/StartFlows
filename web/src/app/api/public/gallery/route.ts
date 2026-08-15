import type { NextRequest } from "next/server";

import { workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";
import { listPublicGallery } from "@/lib/server/work-governance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        const params = request.nextUrl.searchParams;
        return workPublicationOk(
            await listPublicGallery({
                limit: Number(params.get("limit")) || 12,
                sort: params.get("sort"),
                category: params.get("category"),
                tag: params.get("tag"),
                keyword: params.get("keyword"),
                featured: params.get("featured"),
                cursor: params.get("cursor"),
            }),
        );
    } catch (error) {
        return workPublicationError(error, "获取作品广场失败", "List public gallery failed");
    }
}
