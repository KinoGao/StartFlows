import { describe, expect, it } from "vitest";

import { DEFAULT_CHANNEL_CONNECT_ERROR, toSafeGenerationErrorMessage } from "./generation-errors";

describe("generation error messages", () => {
    it("keeps actionable business errors", () => {
        expect(toSafeGenerationErrorMessage(new Error("当前用户视频任务已达到并发上限"), "视频生成失败")).toBe("当前用户视频任务已达到并发上限");
        expect(toSafeGenerationErrorMessage(new Error('{"code":400,"data":null,"msg":"积分不足，无法生成"}'), "生成失败")).toBe("积分不足");
        expect(toSafeGenerationErrorMessage(new Error('{"error":{"message":"MetaJing video requests must use application/json"}}'), "生成失败")).toBe("MetaJing video requests must use application/json");
    });

    it("does not expose infrastructure addresses or environment names", () => {
        expect(toSafeGenerationErrorMessage(new Error("POST http://localhost:3000 failed"), "生成失败")).toBe(DEFAULT_CHANNEL_CONNECT_ERROR);
        expect(toSafeGenerationErrorMessage(new Error("参考图需要公网图片 URL，请配置 NEXT_PUBLIC_SITE_URL"), "生成失败")).toBe("参考素材暂时无法提交给当前生成渠道，请重新上传或稍后重试。");
        expect(toSafeGenerationErrorMessage(new Error("<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx</center></body></html>"), "生成失败")).toBe(DEFAULT_CHANNEL_CONNECT_ERROR);
    });
});
