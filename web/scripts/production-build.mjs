import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skipTypeCheck = process.env.NEXT_SKIP_BUILD_TYPECHECK === "1";
const trackedBuildFiles = ["tsconfig.json", "next-env.d.ts"].map((fileName) => ({ fileName, path: path.join(webRoot, fileName), content: readBuildFile(fileName) }));
let exitCode = 0;

try {
    if (!skipTypeCheck) {
        exitCode = runNode(path.join(webRoot, "node_modules/typescript/bin/tsc"), ["--noEmit", "--pretty", "false"], "TypeScript 类型检查");
    }
    if (exitCode === 0) {
        exitCode = runNode(path.join(webRoot, "node_modules/next/dist/bin/next"), ["build", ...process.argv.slice(2)], "Next.js production 构建", {
            NEXT_SKIP_BUILD_TYPECHECK: "1",
        });
    }
} finally {
    restoreBuildFiles();
}

process.exitCode = exitCode;

function runNode(entry, args, label, environment = {}) {
    console.log("\n> " + label);
    const result = spawnSync(process.execPath, [entry, ...args], {
        cwd: webRoot,
        env: { ...process.env, ...environment },
        stdio: "inherit",
    });

    if (result.error) {
        console.error(label + "无法启动：" + result.error.message);
        return 1;
    }
    return result.status || 0;
}

function readBuildFile(fileName) {
    const filePath = path.join(webRoot, fileName);
    return existsSync(filePath) ? readFileSync(filePath) : undefined;
}

function restoreBuildFiles() {
    for (const file of trackedBuildFiles) {
        if (file.content === undefined) continue;
        let restored = false;
        for (let attempt = 0; attempt < 8; attempt += 1) {
            try {
                writeFileSync(file.path, file.content);
                restored = true;
                break;
            } catch (error) {
                if (attempt === 7) {
                    console.error(`恢复 ${file.fileName} 失败：${error instanceof Error ? error.message : String(error)}`);
                    exitCode ||= 1;
                    break;
                }
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
            }
        }
        if (!restored) exitCode ||= 1;
    }
}
