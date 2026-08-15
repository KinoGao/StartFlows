import { nanoid } from "nanoid";

export function stableGenerationTaskRequestId(scope: string, identifiers: string[]) {
    return [scope, ...identifiers]
        .map((item) => item.trim())
        .filter(Boolean)
        .join(":");
}

export function createFreshGenerationTaskContext(scope: string, identifiers: string[], token = nanoid()) {
    return {
        attemptNo: 1,
        clientRequestId: stableGenerationTaskRequestId(scope, [...identifiers, token]),
    };
}
