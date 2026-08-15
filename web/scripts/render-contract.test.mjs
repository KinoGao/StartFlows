import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { validateRenderBlueprint } from "./render-contract.mjs";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "..");
const source = readFileSync(path.join(repoRoot, "render.yaml"), "utf8");

describe("Render Blueprint contract", () => {
    it("keeps the Web, Worker, database, separated secrets, health check and disk topology aligned", () => {
        expect(validateRenderBlueprint({ repoRoot })).toEqual({
            services: ["vozeb-pro", "vozeb-pro-generation-worker"],
            database: "vozeb-pro-postgres",
            environmentGroup: "vozeb-pro-runtime",
        });
    });

    it("rejects an ephemeral free Web instance", () => {
        expect(() => validateSource(source.replace("    plan: starter", "    plan: free"))).toThrow("持久盘 Web 与后台 Worker 必须使用可用的付费实例");
    });

    it("rejects a Worker that bypasses the private application boundary", () => {
        const unsafe = source.replace("      - key: NODE_OPTIONS\n        value: --max-old-space-size=128", "      - key: DATABASE_URL\n        value: postgres://leaked\n      - key: NODE_OPTIONS\n        value: --max-old-space-size=128");

        expect(() => validateSource(unsafe)).toThrow("Render Worker 不应直接持有数据库配置");
    });

    it("rejects exposing the one-time install token to the Worker", () => {
        const unsafe = source.replace("      - key: NODE_OPTIONS\n        value: --max-old-space-size=128", "      - key: VOZEB_PRO_INSTALL_TOKEN\n        generateValue: true\n      - key: NODE_OPTIONS\n        value: --max-old-space-size=128");

        expect(() => validateSource(unsafe)).toThrow("Render Worker 不得获得一次性安装令牌");
    });

    it("reports malformed environment lists as contract failures", () => {
        const blueprint = parse(source);
        blueprint.services[0].envVars = "invalid";

        expect(() => validateSource(stringify(blueprint))).toThrow("Web 与 Worker 必须引用同一运行时环境组");
    });

    it("rejects an image that omits the Sharp native runtime", () => {
        const dockerfilePath = path.join(repoRoot, "Dockerfile");
        const dockerfile = readFileSync(dockerfilePath, "utf8");
        const unsafe = dockerfile.replace("COPY --from=web-build /app/sharp-runtime/node_modules/.pnpm /app/web/node_modules/.pnpm", "");

        expect(() => validateRenderBlueprint({ repoRoot, dockerfile: unsafe })).toThrow("生产镜像缺少 Sharp 原生依赖");
    });

    it("rejects an image that omits the Worker polling policy", () => {
        const dockerfilePath = path.join(repoRoot, "Dockerfile");
        const dockerfile = readFileSync(dockerfilePath, "utf8");
        const unsafe = dockerfile.replace("COPY web/scripts/generation-worker-policy.mjs /app/web/scripts/generation-worker-policy.mjs", "");

        expect(() => validateRenderBlueprint({ repoRoot, dockerfile: unsafe })).toThrow("生产镜像缺少 Worker 轮询策略 helper");
    });

    it("rejects a production image that runs as root", () => {
        const dockerfilePath = path.join(repoRoot, "Dockerfile");
        const dockerfile = readFileSync(dockerfilePath, "utf8").replace("USER node", "");

        expect(() => validateRenderBlueprint({ repoRoot, dockerfile })).toThrow("生产镜像必须使用非 root 用户运行");
    });

    it("rejects an image that can collect no Sharp native package", () => {
        const dockerfilePath = path.join(repoRoot, "Dockerfile");
        const dockerfile = readFileSync(dockerfilePath, "utf8");
        const unsafe = dockerfile.replace("test -n \"$(find /app/sharp-runtime/node_modules/.pnpm -mindepth 1 -maxdepth 1 -type d -name '@img+sharp-linux-*' -print -quit)\"", "");

        expect(() => validateRenderBlueprint({ repoRoot, dockerfile: unsafe })).toThrow("生产镜像缺少 Sharp 原生依赖存在性检查");
    });

    it("rejects flattening pnpm Sharp packages into node_modules/@img", () => {
        const dockerfilePath = path.join(repoRoot, "Dockerfile");
        const dockerfile = readFileSync(dockerfilePath, "utf8").replace("/app/sharp-runtime/node_modules/.pnpm", "/app/sharp-runtime/node_modules/@img");

        expect(() => validateRenderBlueprint({ repoRoot, dockerfile })).toThrow("生产镜像必须保留 Sharp 的 pnpm 虚拟目录结构");
    });
});

function validateSource(content) {
    return validateRenderBlueprint({ repoRoot, source: content });
}
