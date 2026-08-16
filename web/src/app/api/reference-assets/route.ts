import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { CREATIVE_UPLOAD_MAX_BYTES } from "@/lib/creative-upload";
import { writePersistentMediaDataUrl, writeReferenceMediaDataUrl } from "@/lib/server/reference-asset-store";
import { readJsonBody } from "@/lib/auth/request";
import { createSignedReferenceAssetUrl } from "@/lib/server/reference-asset-access";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    // 持久化上传（画布导入 / 画布媒体上传）允许大文件：视频上限 200MB（base64 后约 267MB），JSON 体上限相应放宽；
    // 临时参考图仍按 20MB 收紧。
    const body = await readJsonBody<{ dataUrl?: unknown; type?: unknown; persistent?: unknown; originalName?: unknown }>(request, 300 * 1024 * 1024).catch(() => ({}) as { dataUrl?: unknown; type?: unknown; persistent?: unknown; originalName?: unknown });
    const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
    if (!dataUrl) return NextResponse.json({ error: "缺少参考素材" }, { status: 400 });
    const type = body.type === "video" || body.type === "audio" ? body.type : "image";
    const persistent = body.persistent === true;

    try {
        const context = {
            ownerUserId: currentUser.id,
            source: "user-upload",
            originalName: typeof body.originalName === "string" ? body.originalName : undefined,
            // 持久化媒体不传 maxBytes，走存储层按类型的上限（图 20MB / 视频 200MB / 音频 30MB）
            ...(persistent ? {} : { maxBytes: CREATIVE_UPLOAD_MAX_BYTES }),
        };
        const asset = persistent ? await writePersistentMediaDataUrl(dataUrl, type, context) : await writeReferenceMediaDataUrl(dataUrl, type, context);
        const origin = resolvePublicRequestOrigin(request);
        const browserUrl = `/api/reference-assets/${asset.token
            .split("/")
            .map((part) => encodeURIComponent(part))
            .join("/")}`;
        return NextResponse.json({
            url: browserUrl,
            upstreamUrl: asset.url || createSignedReferenceAssetUrl(asset.token, origin) || undefined,
            token: asset.token,
            key: asset.token,
            storage: asset.storage,
            bytes: asset.bytes,
            mimeType: asset.mimeType,
        });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "参考图临时保存失败" }, { status: 400 });
    }
}
