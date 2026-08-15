import type { AccountDeletionRequestPage, AccountDeletionRequestStatus, AccountDeletionRequestView, AdminAccountDeletionRequest } from "@/lib/account-deletion-contract";
import { serializeApiParams } from "@/services/api/request";

type ApiResponse<T> = { code: number; data: T; msg: string };

export async function getOwnAccountDeletionRequest() {
    return request<AccountDeletionRequestView | null>("/api/auth/account-deletion");
}

export async function submitOwnAccountDeletionRequest(input: { currentPassword: string; note?: string }) {
    return request<AccountDeletionRequestView>("/api/auth/account-deletion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
}

export async function withdrawOwnAccountDeletionRequest() {
    return request<AccountDeletionRequestView>("/api/auth/account-deletion", { method: "DELETE" });
}

export async function listAdminAccountDeletionRequests(input: { page?: number; pageSize?: number; keyword?: string; status?: AccountDeletionRequestStatus } = {}) {
    const query = serializeApiParams(input);
    return request<AccountDeletionRequestPage>(`/api/admin/account-deletion-requests${query.size ? `?${query.toString()}` : ""}`);
}

export async function reviewAdminAccountDeletionRequest(id: string, input: { status: "accepted" | "rejected"; reviewNote: string }) {
    return request<AdminAccountDeletionRequest>(`/api/admin/account-deletion-requests/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
}

async function request<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, { cache: "no-store", ...init });
    const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
    if (!response.ok || !payload) throw new Error(payload?.msg || "请求失败");
    return payload.data;
}
