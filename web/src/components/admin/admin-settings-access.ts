import { hasAdminPermission } from "@/lib/admin-permissions";
import type { AuthSettings } from "@/lib/auth/store";

type AdminSettingsActor = {
    role?: unknown;
    status?: unknown;
    adminPermissions?: unknown;
};

export type AdminSettingsAccess = {
    system: boolean;
    upstream: boolean;
};

export function resolveAdminSettingsAccess(user: AdminSettingsActor): AdminSettingsAccess {
    return {
        system: hasAdminPermission(user, "system.manage"),
        upstream: hasAdminPermission(user, "upstream.manage"),
    };
}

export function buildAdminSettingsPatch(settings: AuthSettings, access: AdminSettingsAccess): Partial<AuthSettings> {
    return {
        ...(access.system
            ? {
                  registrationEnabled: settings.registrationEnabled,
                  emailRegistrationEnabled: settings.emailRegistrationEnabled,
                  mail: settings.mail,
                  dataLifecycle: settings.dataLifecycle,
              }
            : {}),
        ...(access.upstream
            ? {
                  generationConcurrency: settings.generationConcurrency,
                  generationDefaults: settings.generationDefaults,
                  generationCostControl: settings.generationCostControl,
              }
            : {}),
    };
}
