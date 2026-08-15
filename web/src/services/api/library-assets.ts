import type { Asset, CreateLibraryAssetInput } from "@/lib/library-asset-contract";

export function listLibraryAssets() {
    return listLibraryAssetPage({ page: 1, pageSize: 100 }).then((data) => data.assets);
}

export type LibraryAssetPage = { assets: Asset[]; total: number; page: number; pageSize: number };

export function listLibraryAssetPage(input: { page: number; pageSize: number; kind?: Asset["kind"]; keyword?: string }, signal?: AbortSignal) {
    const query = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) });
    if (input.kind) query.set("kind", input.kind);
    if (input.keyword?.trim()) query.set("keyword", input.keyword.trim());
    return request<LibraryAssetPage>(`/api/library-assets?${query}`, { cache: "no-store", signal });
}

export async function listAllLibraryAssets() {
    const assets: Asset[] = [];
    for (let page = 1; ; page += 1) {
        const result = await listLibraryAssetPage({ page, pageSize: 100 });
        assets.push(...result.assets);
        if (assets.length >= result.total || !result.assets.length) return assets;
    }
}

export function createLibraryAsset(asset: CreateLibraryAssetInput) {
    return request<{ asset: Asset }>("/api/library-assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(asset) }).then((data) => data.asset);
}

export function saveLibraryAsset(id: string, asset: CreateLibraryAssetInput) {
    return request<{ asset: Asset }>(`/api/library-assets/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(asset) }).then((data) => data.asset);
}

export function deleteLibraryAsset(id: string) {
    return request<{ deleted: boolean }>(`/api/library-assets/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function request<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => ({}))) as { data?: T; msg?: string };
    if (!response.ok || !payload.data) throw new Error(payload.msg || "素材请求失败");
    return payload.data;
}
