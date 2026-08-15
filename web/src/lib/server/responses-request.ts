import { fetchInternalApi } from "@/lib/server/internal-origin";

import { TEXT_MODEL_REQUEST_TIMEOUT_MS } from "@/lib/server/model-request-policy";

export const RESPONSES_FALLBACK_TIMEOUT_MS = TEXT_MODEL_REQUEST_TIMEOUT_MS;

export async function fetchOptionalResponses(input: string | URL, init: RequestInit = {}, timeoutMs = RESPONSES_FALLBACK_TIMEOUT_MS) {
    const callerSignal = init.signal || undefined;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
    try {
        return await fetchInternalApi(input, { ...init, signal });
    } catch (error) {
        if (callerSignal?.aborted) throw error;
        return null;
    }
}
