import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { getAuthSettings } from "@/lib/auth/store";
import { getCurrentUser } from "@/lib/auth/session";
import { isUsableAdminChannelApiKey } from "@/lib/server/admin-channel-config";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
    params: Promise<{ id: string }>;
};

const noStoreHeaders = {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
};

export async function POST(request: Request, context: RouteContext) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return json({ error: "请先登录" }, 401);
    if (!hasAdminPermission(currentUser, "upstream.manage")) return json({ error: "需要管理员权限" }, 403);

    const { id } = await context.params;
    try {
        const settings = await getAuthSettings();
        const channel = settings.systemChannels.find((item) => item.id === id);
        if (!channel) return json({ error: "接口渠道不存在" }, 404);
        if (!isUsableAdminChannelApiKey(channel.apiKey)) return json({ error: "该渠道尚未保存可用的 API Key" }, 404);

        await safeRecordAuditLog({
            action: "admin.settings.channel_api_key.view",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "system-model-channel", id: channel.id, label: channel.name },
        });
        return json({ apiKey: channel.apiKey });
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.settings.channel_api_key.view",
            status: "failure",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "system-model-channel", id },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        console.error("Admin channel API key reveal failed", error);
        return json({ error: "读取 API Key 失败" }, 500);
    }
}

function json(body: { apiKey?: string; error?: string }, status = 200) {
    return NextResponse.json(body, { status, headers: noStoreHeaders });
}
