export class BillingInputError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
    }
}

export function isBillingInputError(error: unknown): error is BillingInputError {
    return error instanceof BillingInputError;
}
