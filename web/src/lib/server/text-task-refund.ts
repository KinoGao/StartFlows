import { refundUserPoints } from "@/lib/auth/store";
import { generationModelId } from "@/lib/server/generation-channel";
import { getTextTask, updateTextTask, type TextTask } from "@/lib/server/text-task-store";

export async function refundTextTask(task: TextTask) {
    const billing = task.billing;
    if ((task.status !== "error" && task.status !== "cancelled") || !billing?.pointsRecordId || billing.refunded) return task;
    await refundUserPoints(task.userId, generationModelId(task.config), billing.pointsCost, "text", 1, textTaskRefundIdempotencyKey(task), billing.pointsRecordId);
    await updateTextTask(task.id, { billing: { ...billing, refunded: true } });
    return (await getTextTask(task.id)) || task;
}

export function textTaskRefundIdempotencyKey(task: Pick<TextTask, "id" | "attemptNo">) {
    return `text-task:${task.id}:attempt:${task.attemptNo || 1}:refund`;
}
