"use client";

import { GenerationOperationsClient } from "@/app/admin/generation-operations/components/generation-operations-client";
import type { AdminDashboardController } from "./use-admin-dashboard-controller";

export function AdminGenerationOperationsSection({ controller }: { controller: AdminDashboardController }) {
    const { activeSection } = controller;
    if (activeSection !== "generationOperations") return null;
    return <GenerationOperationsClient />;
}
