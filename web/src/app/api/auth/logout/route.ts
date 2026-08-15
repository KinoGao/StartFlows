import { NextResponse } from "next/server";

import { clearCurrentSession, clearSessionCookie, getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const currentUser = await getCurrentUser();
    await clearCurrentSession();
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response, request);
    if (currentUser) {
        await safeRecordAuditLog({
            action: "auth.logout",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "user", id: currentUser.id, label: currentUser.username },
        });
    }
    return response;
}
