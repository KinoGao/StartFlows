export class GenerationSubmissionSafeFailure extends Error {
    constructor(
        message: string,
        readonly status?: number,
    ) {
        super(message);
        this.name = "GenerationSubmissionSafeFailure";
    }
}

export class GenerationSubmissionUncertainError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "GenerationSubmissionUncertainError";
    }
}

export function isSafeGenerationSubmissionStatus(status: number) {
    return SAFE_SUBMISSION_FAILURE_STATUSES.has(status);
}

export function generationSubmissionResponseError(status: number, message: string) {
    return isSafeGenerationSubmissionStatus(status) ? new GenerationSubmissionSafeFailure(message, status) : new GenerationSubmissionUncertainError(message);
}

export function generationSubmissionUncertainError(error: unknown, fallback: string) {
    if (error instanceof GenerationSubmissionSafeFailure || error instanceof GenerationSubmissionUncertainError) return error;
    return new GenerationSubmissionUncertainError(error instanceof Error && error.message ? error.message : fallback);
}

const SAFE_SUBMISSION_FAILURE_STATUSES = new Set([400, 401, 403, 404, 405, 413, 415, 422, 429]);
