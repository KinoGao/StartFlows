import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const canvasRoot = dirname(fileURLToPath(import.meta.url));
const packagePath = resolve(canvasRoot, "../../../../package.json");
const forbiddenSourceMarkers = ["@xyflow/", "reactflow", "react-flow", "hero8152/Infinite-Canvas", "github.com/hero8152"];
const removedCanvasEntrypoints = ["[id]/use-canvas-pointer-interactions.tsx", "components/vozeb-pro-canvas.tsx", "components/canvas-connections.tsx", "components/canvas-mini-map.tsx", "utils/canvas-connection-path.ts"];

describe("Canvas clean-room boundary", () => {
    it("does not depend on a third-party canvas package or repository marker", async () => {
        const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
        };
        const dependencyNames = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies })
            .join("\n")
            .toLowerCase();
        expect(dependencyNames).not.toMatch(/xyflow|reactflow|react-flow/);

        const files = await readdir(canvasRoot, { recursive: true });
        const sourceFiles = files.filter((file) => /\.(?:ts|tsx|css)$/.test(file) && !file.endsWith("canvas-clean-room.test.ts"));
        const source = (await Promise.all(sourceFiles.map((file) => readFile(resolve(canvasRoot, file), "utf8")))).join("\n").toLowerCase();
        forbiddenSourceMarkers.forEach((marker) => expect(source).not.toContain(marker.toLowerCase()));
    });

    it("keeps the removed canvas engine entrypoints out of the page package", () => {
        removedCanvasEntrypoints.forEach((relativePath) => expect(existsSync(resolve(canvasRoot, relativePath))).toBe(false));
    });
});
