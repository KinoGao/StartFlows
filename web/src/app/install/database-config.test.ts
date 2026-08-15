import { describe, expect, it } from "vitest";

import { parse } from "yaml";
import { buildDeploymentSnippets, generateDeploymentSecret } from "./database-config";

const baseConfig = {
    mode: "baota" as const,
    host: "127.0.0.1",
    port: "5432",
    database: "vozeb_pro",
    username: "vozeb_pro",
    password: "safe password",
    ssl: false,
    encryptionKey: "ab".repeat(32),
    installToken: "ef".repeat(32),
    maintenanceToken: "cd".repeat(32),
    workerToken: "12".repeat(32),
};

describe("database deployment config", () => {
    it("generates an exact 32-byte hexadecimal deployment secret", () => {
        expect(generateDeploymentSecret()).toMatch(/^[a-f0-9]{64}$/);
    });

    it("uses host networking without a bundled PostgreSQL service in Baota mode", () => {
        const snippets = buildDeploymentSnippets(baseConfig);

        expect(snippets.envText).toContain("@127.0.0.1:5432/vozeb_pro");
        expect(snippets.composeText).toContain("network_mode: host");
        expect(snippets.composeText).not.toContain("postgres:\n");
        expect(snippets.composeText).not.toContain("ports:");
        expect(snippets.composeText).toContain(`VOZEB_PRO_ENCRYPTION_KEY: "${baseConfig.encryptionKey}"`);
        expect(snippets.envText).toContain(`VOZEB_PRO_INSTALL_TOKEN=${baseConfig.installToken}`);
        expect(snippets.composeText.match(/VOZEB_PRO_INSTALL_TOKEN:/g)).toHaveLength(1);
        expect(snippets.envText).toContain(`VOZEB_PRO_MAINTENANCE_TOKEN=${baseConfig.maintenanceToken}`);
        expect(snippets.envText).toContain(`VOZEB_PRO_WORKER_TOKEN=${baseConfig.workerToken}`);
        expect(snippets.composeText.match(/VOZEB_PRO_MAINTENANCE_TOKEN:/g)).toHaveLength(1);
        expect(snippets.composeText.match(/VOZEB_PRO_WORKER_TOKEN:/g)).toHaveLength(2);
        expect(snippets.composeText).toContain("generation-worker:");
        expect(snippets.composeText).toContain("VOZEB_PRO_WORKER_API_ORIGIN: http://127.0.0.1:3000");
        expect(snippets.envText).toContain("VOZEB_PRO_TRUSTED_PROXY_HOPS=1");
        expect(snippets.composeText).toContain('VOZEB_PRO_TRUSTED_PROXY_HOPS: "1"');
    });

    it.each([
        { mode: "local" as const, host: "localhost", ssl: false },
        { mode: "docker" as const, host: "postgres", ssl: false },
        { mode: "cloud" as const, host: "db.example.com", ssl: true },
    ])("does not inject Baota proxy defaults into $mode mode", ({ mode, host, ssl }) => {
        const snippets = buildDeploymentSnippets({ ...baseConfig, mode, host, ssl });

        expect(snippets.envText).not.toContain("VOZEB_PRO_TRUSTED_PROXY_HOPS");
        expect(snippets.composeText).not.toContain("VOZEB_PRO_TRUSTED_PROXY_HOPS");
        expect(snippets.composeText).toContain("generation-worker:");
        expect(snippets.composeText.match(/VOZEB_PRO_MAINTENANCE_TOKEN:/g)).toHaveLength(1);
        expect(snippets.composeText.match(/VOZEB_PRO_WORKER_TOKEN:/g)).toHaveLength(2);
    });

    it("uses the Compose service name for the bundled Worker origin", () => {
        const snippets = buildDeploymentSnippets({ ...baseConfig, mode: "docker", host: "postgres" });

        expect(snippets.envText).toContain(`POSTGRES_PASSWORD=${baseConfig.password}`);
        expect(snippets.envText).not.toContain("DATABASE_URL=");
        expect(snippets.composeText).toContain("VOZEB_PRO_WORKER_API_ORIGIN: http://app:3000");
        expect(snippets.composeText).toContain('command: ["node", "/app/web/scripts/generation-worker.mjs"]');
        expect(snippets.composeText).toContain("condition: service_healthy");
    });

    it.each([
        { mode: "docker" as const, host: "postgres", ssl: false },
        { mode: "baota" as const, host: "127.0.0.1", ssl: false },
        { mode: "cloud" as const, host: "db.example.com", ssl: true },
    ])("generates valid Compose YAML for $mode mode", ({ mode, host, ssl }) => {
        const document = parse(buildDeploymentSnippets({ ...baseConfig, mode, host, ssl }).composeText);

        expect(Object.keys(document.services)).toContain("app");
        expect(Object.keys(document.services)).toContain("generation-worker");
        expect(document.services.app.environment.VOZEB_PRO_MAINTENANCE_TOKEN).toBe(baseConfig.maintenanceToken);
        expect(document.services.app.environment.VOZEB_PRO_WORKER_TOKEN).toBe(baseConfig.workerToken);
        expect(document.services.app.environment.VOZEB_PRO_INSTALL_TOKEN).toBe(baseConfig.installToken);
        expect(document.services["generation-worker"].environment.VOZEB_PRO_WORKER_TOKEN).toBe(baseConfig.workerToken);
        expect(document.services["generation-worker"].environment.VOZEB_PRO_MAINTENANCE_TOKEN).toBeUndefined();
        expect(document.services["generation-worker"].environment.VOZEB_PRO_INSTALL_TOKEN).toBeUndefined();
    });
});
