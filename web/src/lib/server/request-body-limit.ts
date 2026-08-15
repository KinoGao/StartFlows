export class RequestBodyTooLargeError extends Error {
    status = 413;

    constructor(message = "请求体过大") {
        super(message);
    }
}

export async function readRequestBodyBytes(request: Request, maxBytes: number) {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new RequestBodyTooLargeError();
    if (!request.body) return new Uint8Array();

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel().catch(() => undefined);
            throw new RequestBodyTooLargeError();
        }
        chunks.push(value);
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}

export async function readRequestBodyText(request: Request, maxBytes: number) {
    return new TextDecoder().decode(await readRequestBodyBytes(request, maxBytes));
}
