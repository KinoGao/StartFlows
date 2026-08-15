import { NextResponse } from "next/server";

import { listAnnouncementsPage } from "@/lib/auth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const page = await listAnnouncementsPage(false, { page: 1, pageSize: 20 });
    return NextResponse.json({ announcements: page.items });
}
