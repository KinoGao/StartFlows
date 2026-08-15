import { getCurrentUser } from "@/lib/auth/session";
import { getInstallStatus } from "@/lib/server/install-status";

export async function getAuthenticatedPageAccess() {
    try {
        const user = await getCurrentUser();
        if (user) return { user, install: null };
    } catch {}
    const install = await getInstallStatus();
    return { user: null, install };
}
