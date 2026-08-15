export const MAX_MEDIA_PROXY_BYTES = 300 * 1024 * 1024;
export const MAX_MEDIA_PROXY_RANGE_BYTES = 32 * 1024 * 1024;

export function normalizeMediaProxyRange(value: string | null): string | "invalid" | null {
    if (!value) return null;
    const match = value.match(/^bytes=(\d*)-(\d*)$/);
    if (!match || (!match[1] && !match[2])) return "invalid";
    if (!match[1]) {
        const suffixLength = Number(match[2]);
        return Number.isSafeInteger(suffixLength) && suffixLength > 0 ? `bytes=-${Math.min(suffixLength, MAX_MEDIA_PROXY_RANGE_BYTES)}` : "invalid";
    }

    const start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : start + MAX_MEDIA_PROXY_RANGE_BYTES - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || requestedEnd < start) return "invalid";
    return `bytes=${start}-${Math.min(requestedEnd, start + MAX_MEDIA_PROXY_RANGE_BYTES - 1)}`;
}

export function mediaResponseExceedsLimit(headers: Headers, maxBytes = MAX_MEDIA_PROXY_BYTES) {
    const contentLength = Number(headers.get("content-length") || 0);
    return Number.isFinite(contentLength) && contentLength > maxBytes;
}

export function limitMediaResponseBody(body: ReadableStream<Uint8Array> | null, maxBytes = MAX_MEDIA_PROXY_BYTES, timeoutMs = 0) {
    if (!body) return null;
    const reader = body.getReader();
    let total = 0;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clearTimer = () => {
        if (timer) clearTimeout(timer);
    };
    return new ReadableStream<Uint8Array>({
        start(controller) {
            if (timeoutMs <= 0) return;
            timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                clearTimer();
                void reader.cancel("Media download timed out").catch(() => undefined);
                controller.error(new Error("Media download timed out"));
            }, timeoutMs);
            timer.unref?.();
        },
        async pull(controller) {
            if (settled) return;
            try {
                const { done, value } = await reader.read();
                if (settled) return;
                if (done) {
                    settled = true;
                    clearTimer();
                    controller.close();
                    return;
                }
                total += value.byteLength;
                if (total > maxBytes) {
                    settled = true;
                    clearTimer();
                    await reader.cancel("Media is too large");
                    controller.error(new Error("Media is too large"));
                    return;
                }
                controller.enqueue(value);
            } catch (error) {
                if (settled) return;
                settled = true;
                clearTimer();
                controller.error(error);
            }
        },
        cancel(reason) {
            if (settled) return;
            settled = true;
            clearTimer();
            return reader.cancel(reason);
        },
    });
}
