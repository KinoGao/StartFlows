export const ACCOUNT_DELETION_REQUEST_STATUSES = ["pending", "accepted", "rejected", "withdrawn"] as const;

export type AccountDeletionRequestStatus = (typeof ACCOUNT_DELETION_REQUEST_STATUSES)[number];

export type AccountDeletionRequestView = {
    id: string;
    status: AccountDeletionRequestStatus;
    note: string;
    reviewNote: string;
    requestedAt: string;
    updatedAt: string;
    handledAt?: string;
};

export type AdminAccountDeletionRequest = AccountDeletionRequestView & {
    userId: string;
    accountId?: string;
    username: string;
    displayName: string;
    email?: string;
    reviewedByUsername?: string;
};

export type AccountDeletionRequestPage = {
    items: AdminAccountDeletionRequest[];
    total: number;
    page: number;
    pageSize: number;
};
