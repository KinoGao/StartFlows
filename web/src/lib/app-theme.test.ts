import { describe, expect, it } from "vitest";

import { getAntThemeConfig } from "./app-theme";

describe("app Select theme", () => {
    it.each([false, true])("keeps selected items neutral and hover-driven (dark=%s)", (dark) => {
        const config = getAntThemeConfig(dark);
        const select = config.components?.Select;

        expect(select?.optionSelectedBg).toBe("transparent");
        expect(select?.optionSelectedFontWeight).toBe(400);
        expect(select?.controlItemBgActiveHover).toBe(select?.optionSelectedBg);
        expect(select?.activeBorderColor).not.toBe(dark ? "#fafafa" : "#171717");
    });
});
