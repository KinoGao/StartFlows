import { fileTypeFromBuffer } from "file-type";

export const MEDIA_SNIFF_BYTES = 8 * 1024;
export const MEDIA_SNIFF_RANGE = `bytes=0-${MEDIA_SNIFF_BYTES - 1}`;

export type SafeMediaContent = {
    body: ReadableStream<Uint8Array>;
    extension: string;
    mimeType: string;
    type: "image" | "video" | "audio";
};

export class UnsupportedMediaContentError extends Error {
    readonly status = 415;

    constructor() {
        super("Unsupported media content");
        this.name = "UnsupportedMediaContentError";
    }
}

export async function inspectSafeMediaBody(body: ReadableStream<Uint8Array> | null): Promise<SafeMediaContent> {
    if (!body) throw new UnsupportedMediaContentError();
    const reader = body.getReader();
    const buffered: Uint8Array[] = [];
    let bufferedBytes = 0;
    let sourceDone = false;
    try {
        while (bufferedBytes < MEDIA_SNIFF_BYTES) {
            const next = await reader.read();
            if (next.done) {
                sourceDone = true;
                break;
            }
            buffered.push(next.value);
            bufferedBytes += next.value.byteLength;
        }
        const detected = await fileTypeFromBuffer(prefixBytes(buffered, Math.min(bufferedBytes, MEDIA_SNIFF_BYTES)));
        const type = detected ? safeMediaType(detected.mime) : null;
        if (!detected || !type) {
            await reader.cancel("Unsupported media content").catch(() => undefined);
            throw new UnsupportedMediaContentError();
        }
        return { body: replayMediaBody(reader, buffered, sourceDone), extension: detected.ext, mimeType: detected.mime, type };
    } catch (error) {
        if (!(error instanceof UnsupportedMediaContentError)) await reader.cancel(error).catch(() => undefined);
        throw error;
    }
}

export async function probeSafeMediaBody(body: ReadableStream<Uint8Array> | null) {
    const inspected = await inspectSafeMediaBody(body);
    await inspected.body.cancel("Media type probe completed").catch(() => undefined);
    return { extension: inspected.extension, mimeType: inspected.mimeType, type: inspected.type };
}

export function mediaRequestNeedsTypeProbe(method: "GET" | "HEAD", range: string | null) {
    if (method === "HEAD") return true;
    if (!range) return false;
    const match = range.match(/^bytes=(\d+)-(\d+)$/);
    return !match || Number(match[1]) !== 0 || Number(match[2]) < MEDIA_SNIFF_BYTES - 1;
}

function safeMediaType(mimeType: string): SafeMediaContent["type"] | null {
    const normalized = mimeType.toLowerCase();
    if (normalized === "image/svg+xml") return null;
    if (normalized.startsWith("image/")) return "image";
    if (normalized.startsWith("video/")) return "video";
    if (normalized.startsWith("audio/") || normalized === "application/ogg") return "audio";
    return null;
}

function prefixBytes(chunks: Uint8Array[], length: number) {
    const prefix = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        const remaining = length - offset;
        if (remaining <= 0) break;
        const slice = chunk.subarray(0, remaining);
        prefix.set(slice, offset);
        offset += slice.byteLength;
    }
    return prefix;
}

function replayMediaBody(reader: ReadableStreamDefaultReader<Uint8Array>, buffered: Uint8Array[], sourceDone: boolean) {
    let index = 0;
    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            if (index < buffered.length) {
                controller.enqueue(buffered[index++]);
                if (sourceDone && index === buffered.length) controller.close();
                return;
            }
            if (sourceDone) {
                controller.close();
                return;
            }
            try {
                const next = await reader.read();
                if (next.done) controller.close();
                else controller.enqueue(next.value);
            } catch (error) {
                controller.error(error);
            }
        },
        cancel(reason) {
            return reader.cancel(reason);
        },
    });
}
