import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "@/lib/auth/store";
import { beginAdminSettingsSave, createAdminSettingsSaveSnapshot, finishAdminSettingsSave, mergeAdminSettingsSaveResponse } from "./admin-settings-save";

function settings() {
    return structuredClone(DEFAULT_SETTINGS);
}

describe("admin settings save response merge", () => {
    it("keeps loading active until every concurrent save has settled", () => {
        const active = beginAdminSettingsSave(beginAdminSettingsSave(0));

        const first = finishAdminSettingsSave(active);
        const second = finishAdminSettingsSave(first.remaining);

        expect(first).toEqual({ remaining: 1, loading: true });
        expect(second).toEqual({ remaining: 0, loading: false });
    });

    it("applies only fields included in the submitted patch", () => {
        const current = settings();
        current.registrationEnabled = false;
        const submittedSite = { ...current.site, title: "提交时标题" };
        const snapshot = createAdminSettingsSaveSnapshot({ site: submittedSite });
        const response = settings();
        response.site = { ...submittedSite, title: "服务端标题" };
        response.registrationEnabled = true;

        const next = mergeAdminSettingsSaveResponse({ ...current, site: submittedSite }, response, snapshot);

        expect(next.site.title).toBe("服务端标题");
        expect(next.registrationEnabled).toBe(false);
    });

    it("does not overwrite a field edited while its save request is pending", () => {
        const current = settings();
        const submittedSite = { ...current.site, title: "已提交标题" };
        const snapshot = createAdminSettingsSaveSnapshot({ site: submittedSite });
        const editedSite = { ...submittedSite, title: "请求期间继续编辑" };
        const response = settings();
        response.site = { ...submittedSite, title: "服务端规范化标题" };

        const next = mergeAdminSettingsSaveResponse({ ...current, site: editedSite }, response, snapshot);

        expect(next.site.title).toBe("请求期间继续编辑");
    });

    it("prevents an older response from replacing a newer submitted value", () => {
        const initial = settings();
        const firstSite = { ...initial.site, title: "第一次提交" };
        const secondSite = { ...initial.site, title: "第二次提交" };
        const firstSnapshot = createAdminSettingsSaveSnapshot({ site: firstSite });
        const secondSnapshot = createAdminSettingsSaveSnapshot({ site: secondSite });
        const firstResponse = { ...settings(), site: { ...firstSite, title: "旧响应" } };
        const secondResponse = { ...settings(), site: { ...secondSite, title: "新响应" } };

        const afterOldResponse = mergeAdminSettingsSaveResponse({ ...initial, site: secondSite }, firstResponse, firstSnapshot);
        const afterNewResponse = mergeAdminSettingsSaveResponse(afterOldResponse, secondResponse, secondSnapshot);

        expect(afterOldResponse.site.title).toBe("第二次提交");
        expect(afterNewResponse.site.title).toBe("新响应");
    });
});
