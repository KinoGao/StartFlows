import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "@/lib/auth/store-foundation";

import { buildAdminSettingsPatch, resolveAdminSettingsAccess } from "./admin-settings-access";

describe("administrator settings access", () => {
    it("builds only system settings for a system administrator", () => {
        const access = resolveAdminSettingsAccess({ role: "admin", status: "active", adminPermissions: ["system.manage"] });

        expect(access).toEqual({ system: true, upstream: false });
        expect(buildAdminSettingsPatch(DEFAULT_SETTINGS, access)).toEqual({
            registrationEnabled: DEFAULT_SETTINGS.registrationEnabled,
            emailRegistrationEnabled: DEFAULT_SETTINGS.emailRegistrationEnabled,
            mail: DEFAULT_SETTINGS.mail,
            dataLifecycle: DEFAULT_SETTINGS.dataLifecycle,
        });
    });

    it("builds only generation settings for an upstream administrator", () => {
        const access = resolveAdminSettingsAccess({ role: "admin", status: "active", adminPermissions: ["upstream.manage"] });

        expect(access).toEqual({ system: false, upstream: true });
        expect(buildAdminSettingsPatch(DEFAULT_SETTINGS, access)).toEqual({
            generationConcurrency: DEFAULT_SETTINGS.generationConcurrency,
            generationDefaults: DEFAULT_SETTINGS.generationDefaults,
            generationCostControl: DEFAULT_SETTINGS.generationCostControl,
        });
    });

    it("does not grant settings access from an inactive or non-admin account", () => {
        expect(resolveAdminSettingsAccess({ role: "admin", status: "disabled", adminPermissions: ["system.manage", "upstream.manage"] })).toEqual({ system: false, upstream: false });
        expect(resolveAdminSettingsAccess({ role: "user", status: "active", adminPermissions: ["system.manage", "upstream.manage"] })).toEqual({ system: false, upstream: false });
    });
});
