import type { CreateWorkbenchOverviewPayload } from "@/lib/create-workbench-overview";

export async function getCreateWorkbenchOverview() {
    const response = await fetch("/api/create/overview", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as { data?: { overview?: CreateWorkbenchOverviewPayload }; msg?: string };
    if (!response.ok || !payload.data?.overview) throw new Error(payload.msg || "工作台概览加载失败");
    return payload.data.overview;
}
