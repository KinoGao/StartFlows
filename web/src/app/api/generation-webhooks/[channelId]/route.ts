import { NextResponse } from "next/server";

import { getAuthSettings } from "@/lib/auth/store";
import { readProviderString } from "@/lib/server/provider-task-config";
import { GenerationWebhookVerificationError, verifyGenerationWebhookSignature } from "@/lib/server/generation-webhook-provider";
import { GenerationWebhookError, recordGenerationWebhook } from "@/lib/server/generation-task-webhook";
import { readRequestBodyText, RequestBodyTooLargeError } from "@/lib/server/request-body-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_KEYS = ["task_id", "taskId", "id", "job_id", "jobId", "generation_id", "generationId"];
const EVENT_KEYS = ["event_id", "eventId", "webhook_id", "webhookId", "event.id"];
const STATUS_KEYS = ["status", "state", "task_status", "taskStatus"];
const RESULT_KEYS = ["video_url", "videoUrl", "image_url", "imageUrl", "audio_url", "audioUrl", "media_url", "mediaUrl", "output_url", "outputUrl", "result_url", "resultUrl", "url", "uri"];

export async function POST(request: Request, { params }: { params: Promise<{ channelId: string }> }) {
    try {
        const [{ channelId: rawChannelId }, rawBody, settings] = await Promise.all([params, readRequestBodyText(request, 1024 * 1024), getAuthSettings()]);
        const channelId = rawChannelId.trim();
        const channel = settings.systemChannels.find((item) => item.id === channelId && item.enabled);
        if (!channel) return NextResponse.json({ code: 404, data: null, msg: "生成回调渠道不存在" }, { status: 404 });
        const payload = JSON.parse(rawBody) as unknown;
        const eventId = request.headers.get("x-vozeb-pro-event-id")?.trim() || readProviderString(payload, "event.id", EVENT_KEYS);
        const verification = verifyGenerationWebhookSignature({
            channelId,
            eventId,
            timestamp: request.headers.get("x-vozeb-pro-timestamp") || request.headers.get("x-timestamp") || "",
            rawBody,
            signature: request.headers.get("x-vozeb-pro-signature") || request.headers.get("x-signature") || "",
            secret: channel.webhookSecret || "",
        });
        const upstreamTaskId = readProviderString(payload, undefined, ID_KEYS);
        const result = await recordGenerationWebhook({
            channelId,
            eventId,
            upstreamTaskId,
            upstreamStatus: readProviderString(payload, channel.advancedConfig?.statusField, STATUS_KEYS),
            resultUrl: readProviderString(payload, channel.advancedConfig?.resultField, RESULT_KEYS),
            rawBody,
            signatureTimestamp: verification.signatureTimestamp,
        });
        return NextResponse.json({ code: 0, data: result, msg: result.duplicate ? "回调事件已处理" : result.matched ? "生成任务已更新" : "回调已登记，等待任务对账" });
    } catch (error) {
        if (error instanceof RequestBodyTooLargeError || error instanceof GenerationWebhookError || error instanceof GenerationWebhookVerificationError)
            return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
        if (error instanceof SyntaxError) return NextResponse.json({ code: 400, data: null, msg: "生成回调不是有效 JSON" }, { status: 400 });
        console.error("Generation webhook failed", error);
        return NextResponse.json({ code: 500, data: null, msg: "生成回调处理失败" }, { status: 500 });
    }
}
