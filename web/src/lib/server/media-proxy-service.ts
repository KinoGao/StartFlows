import { inspectSafeMediaBody, mediaRequestNeedsTypeProbe, MEDIA_SNIFF_RANGE, probeSafeMediaBody, UnsupportedMediaContentError } from "./media-content-validation";
import { limitMediaResponseBody, mediaResponseExceedsLimit } from "./media-response-limit";

type MediaFetcher = (method: "GET" | "HEAD", range: string | null) => Promise<Response>;

export type SafeUpstreamMedia = {
    body: ReadableStream<Uint8Array> | null;
    mimeType: string;
    response: Response;
};

export class MediaProxyResponseError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
        this.name = "MediaProxyResponseError";
    }
}

export async function fetchSafeUpstreamMedia(input: { method: "GET" | "HEAD"; range: string | null; maxBytes: number; timeoutMs: number; fetcher: MediaFetcher }): Promise<SafeUpstreamMedia> {
    let detected: Awaited<ReturnType<typeof probeSafeMediaBody>> | null = null;
    if (mediaRequestNeedsTypeProbe(input.method, input.range)) detected = await probeMediaType(input.fetcher);

    const response = await input.fetcher(input.method, input.range);
    if (!response.ok) {
        await response.body?.cancel("Upstream media request failed").catch(() => undefined);
        throw new MediaProxyResponseError("Media fetch failed", safeUpstreamStatus(response.status));
    }
    if (mediaResponseExceedsLimit(response.headers, input.maxBytes)) {
        await response.body?.cancel("Media is too large").catch(() => undefined);
        throw new MediaProxyResponseError("Media is too large", 413);
    }

    if (input.method === "HEAD") return { body: null, mimeType: detected!.mimeType, response };
    if (!detected) {
        const inspected = await inspectSafeMediaBody(response.body);
        detected = inspected;
        return { body: limitMediaResponseBody(inspected.body, input.maxBytes, input.timeoutMs), mimeType: detected.mimeType, response };
    }
    if (!response.body) throw new UnsupportedMediaContentError();
    return { body: limitMediaResponseBody(response.body, input.maxBytes, input.timeoutMs), mimeType: detected.mimeType, response };
}

async function probeMediaType(fetcher: MediaFetcher) {
    let response = await fetcher("GET", MEDIA_SNIFF_RANGE);
    if (!response.ok && rangeProbeUnsupported(response.status)) {
        await response.body?.cancel("Media range probe unsupported").catch(() => undefined);
        response = await fetcher("GET", null);
    }
    if (!response.ok) {
        await response.body?.cancel("Upstream media probe failed").catch(() => undefined);
        throw new MediaProxyResponseError("Media fetch failed", safeUpstreamStatus(response.status));
    }
    try {
        return await probeSafeMediaBody(response.body);
    } catch (error) {
        if (error instanceof UnsupportedMediaContentError) throw error;
        throw new MediaProxyResponseError("Media fetch failed", 502);
    }
}

function rangeProbeUnsupported(status: number) {
    return [400, 405, 416, 501].includes(status);
}

function safeUpstreamStatus(status: number) {
    return status >= 400 && status < 600 ? status : 502;
}
