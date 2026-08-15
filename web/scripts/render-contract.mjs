import { readFileSync } from "node:fs";
import path from "node:path";

import { parse } from "yaml";

export function validateRenderBlueprint({ repoRoot, source, dockerfile: dockerfileSource }) {
    const file = "render.yaml";
    let blueprint;
    try {
        blueprint = parse(source ?? readFileSync(path.join(repoRoot, file), "utf8"));
    } catch (error) {
        throw new Error(`${file}: YAML 解析失败：${error.message}`);
    }

    const violations = [];
    const ensure = (condition, message) => {
        if (!condition) violations.push(message);
    };
    const services = Array.isArray(blueprint?.services) ? blueprint.services : [];
    const databases = Array.isArray(blueprint?.databases) ? blueprint.databases : [];
    const environmentGroups = Array.isArray(blueprint?.envVarGroups) ? blueprint.envVarGroups : [];
    const web = services.find((service) => service?.name === "vozeb-pro");
    const worker = services.find((service) => service?.name === "vozeb-pro-generation-worker");
    const database = databases.find((entry) => entry?.name === "vozeb-pro-postgres");
    const runtimeGroup = environmentGroups.find((group) => group?.name === "vozeb-pro-runtime");
    const webEnvironment = environmentMap(web?.envVars);
    const workerEnvironment = environmentMap(worker?.envVars);
    const dockerfile = dockerfileSource ?? readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");

    ensure(services.length === 2 && web?.type === "web", "Blueprint 必须声明唯一 Web 服务");
    ensure(worker?.type === "worker", "Blueprint 缺少独立 generation worker");
    ensure(web?.runtime === "docker" && worker?.runtime === "docker", "Web 与 Worker 必须共用 Docker runtime");
    ensure(web?.plan === "starter" && worker?.plan === "starter", "持久盘 Web 与后台 Worker 必须使用可用的付费实例");
    ensure(web?.healthCheckPath === "/api/health/live", "Render 存活检查必须调用 /api/health/live");
    ensure(web?.disk?.mountPath === "/app/web/.data" && Number(web?.disk?.sizeGB) >= 10, "Web 缺少 /app/web/.data 持久盘");
    ensure(worker?.dockerCommand === "node /app/web/scripts/generation-worker.mjs", "Render Worker 启动命令不正确");
    ensure(dockerfile.includes("COPY web/scripts/generation-worker.mjs /app/web/scripts/generation-worker.mjs"), "生产镜像缺少 generation worker");
    ensure(dockerfile.includes("COPY web/scripts/generation-runtime.mjs /app/web/scripts/generation-runtime.mjs"), "生产镜像缺少 Worker 运行时 helper");
    ensure(dockerfile.includes("COPY web/scripts/generation-worker-policy.mjs /app/web/scripts/generation-worker-policy.mjs"), "生产镜像缺少 Worker 轮询策略 helper");
    ensure(!dockerfile.includes("/app/sharp-runtime/node_modules/@img"), "生产镜像必须保留 Sharp 的 pnpm 虚拟目录结构");
    ensure(dockerfile.includes("find node_modules/.pnpm -mindepth 1 -maxdepth 1 -type d -name '@img+sharp-*' -exec cp -a {} /app/sharp-runtime/node_modules/.pnpm/"), "生产镜像缺少 Sharp 原生依赖收集步骤");
    ensure(dockerfile.includes("test -n \"$(find /app/sharp-runtime/node_modules/.pnpm -mindepth 1 -maxdepth 1 -type d -name '@img+sharp-linux-*' -print -quit)\""), "生产镜像缺少 Sharp 原生依赖存在性检查");
    ensure(dockerfile.includes("test -n \"$(find /app/sharp-runtime/node_modules/.pnpm -mindepth 1 -maxdepth 1 -type d -name '@img+sharp-libvips-linux-*' -print -quit)\""), "生产镜像缺少 Sharp libvips 依赖存在性检查");
    ensure(dockerfile.includes("COPY --from=web-build /app/sharp-runtime/node_modules/.pnpm /app/web/node_modules/.pnpm"), "生产镜像缺少 Sharp 原生依赖");
    ensure(dockerfile.includes("RUN cd /app/web && node -e \"require('sharp')\""), "生产镜像缺少 Sharp 运行时检查");
    ensure(/\nUSER\s+node\s*\n/.test(dockerfile), "生产镜像必须使用非 root 用户运行");
    ensure(dockerfile.includes("chown -R node:node /app/web"), "生产镜像必须把运行目录授权给非 root 用户");
    ensure(hasGroup(web?.envVars, "vozeb-pro-runtime") && hasGroup(worker?.envVars, "vozeb-pro-runtime"), "Web 与 Worker 必须引用同一运行时环境组");
    ensure(environmentMap(runtimeGroup?.envVars).VOZEB_PRO_WORKER_TOKEN?.generateValue === true, "运行时环境组必须生成共享 Worker 令牌");
    ensure(webEnvironment.VOZEB_PRO_DATA_DIR?.value === "/app/web/.data", "Web 数据目录必须位于持久盘");
    ensure(webEnvironment.DATABASE_URL?.fromDatabase?.name === "vozeb-pro-postgres", "Web 必须引用 Blueprint PostgreSQL");
    ensure(webEnvironment.VOZEB_PRO_ENCRYPTION_KEY?.generateValue === true, "Web 必须生成稳定加密密钥");
    ensure(webEnvironment.VOZEB_PRO_INSTALL_TOKEN?.generateValue === true, "Web 必须生成一次性安装令牌");
    ensure(webEnvironment.VOZEB_PRO_MAINTENANCE_TOKEN?.generateValue === true, "Web 必须生成独立维护令牌");
    ensure(!workerEnvironment.VOZEB_PRO_INSTALL_TOKEN, "Render Worker 不得获得一次性安装令牌");
    ensure(!workerEnvironment.VOZEB_PRO_MAINTENANCE_TOKEN, "Render Worker 不得获得外部维护令牌");
    ensure(workerEnvironment.VOZEB_PRO_WORKER_API_ORIGIN?.fromService?.name === "vozeb-pro" && workerEnvironment.VOZEB_PRO_WORKER_API_ORIGIN?.fromService?.property === "hostport", "Worker 必须通过 Render 私网调用 Web");
    ensure(!workerEnvironment.DATABASE_URL && !workerEnvironment.VOZEB_PRO_DATABASE_PROVIDER, "Render Worker 不应直接持有数据库配置");
    ensure(database?.plan === "basic-256mb" && database?.databaseName === "vozeb_pro" && database?.user === "vozeb_pro", "Render PostgreSQL 必须使用持久生产实例和稳定名称");

    if (violations.length > 0) throw new Error(`Render Blueprint 契约失败：\n- ${violations.join("\n- ")}`);
    return { services: services.map(({ name }) => name), database: database.name, environmentGroup: runtimeGroup.name };
}

function environmentMap(envVars) {
    const entries = Array.isArray(envVars) ? envVars : [];
    return Object.fromEntries(entries.filter((entry) => entry?.key).map((entry) => [entry.key, entry]));
}

function hasGroup(envVars, name) {
    return Array.isArray(envVars) && envVars.some((entry) => entry?.fromGroup === name);
}
