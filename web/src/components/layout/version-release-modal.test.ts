import { describe, expect, it } from "vitest";
import { getReleaseTagColor } from "./version-release-modal";

describe("getReleaseTagColor", () => {
    it("为当前发布分类提供语义配色", () => {
        expect(getReleaseTagColor("Agent")).toBe("geekblue");
        expect(getReleaseTagColor("生成")).toBe("green");
        expect(getReleaseTagColor("商业")).toBe("volcano");
        expect(getReleaseTagColor("安装")).toBe("orange");
    });

    it("为未知分类保留默认样式", () => {
        expect(getReleaseTagColor("未知分类")).toBe("default");
    });
});
