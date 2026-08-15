import { NextResponse } from "next/server";

import { WorkPublicationServiceError } from "@/lib/server/work-publication-service";
import { WorkGovernanceServiceError } from "@/lib/server/work-governance-service";
import { WorkCommunityServiceError } from "@/lib/server/work-community-service";

export function workPublicationOk<T>(data: T, msg = "OK", status = 200) {
    return NextResponse.json({ code: 0, data, msg }, { status });
}

export function workPublicationError(error: unknown, fallback: string, context: string) {
    if (error instanceof WorkPublicationServiceError || error instanceof WorkGovernanceServiceError || error instanceof WorkCommunityServiceError) {
        return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
    }
    console.error(context, error);
    return NextResponse.json({ code: 500, data: null, msg: fallback }, { status: 500 });
}

export function unauthorized() {
    return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
}

export function forbidden() {
    return NextResponse.json({ code: 403, data: null, msg: "需要管理员权限" }, { status: 403 });
}
