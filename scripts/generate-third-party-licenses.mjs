import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(repoRoot, "THIRD_PARTY_LICENSES.md");
const sections = [
    ["Web 应用", "web"],
    ["文档站", "docs"],
];

const content = `${[
    "# 第三方依赖许可证清单",
    "",
    "本清单由 `pnpm licenses list --json --prod` 根据锁文件生成，仅列运行时依赖；依赖自身的许可证正文和版权声明以对应软件包为准。",
    "",
    ...(await Promise.all(sections.map(([title, directory]) => renderSection(title, directory)))).flat(),
].join("\n").trimEnd()}\n`;

if (process.argv.includes("--check")) {
    const current = await readFile(outputPath, "utf8").catch(() => "");
    if (current !== content) {
        console.error("THIRD_PARTY_LICENSES.md 已过期，请运行 pnpm licenses:generate。\n");
        process.exit(1);
    }
    console.log("第三方许可证清单已是最新。\n");
} else {
    await writeFile(outputPath, content, "utf8");
    console.log(`已生成 ${path.relative(repoRoot, outputPath)}。\n`);
}

async function renderSection(title, directory) {
    const inventory = licenseInventory(path.join(repoRoot, directory));
    const rows = Object.entries(inventory)
        .flatMap(([license, packages]) => packages.map((item) => ({ license, name: item.name, versions: item.versions, homepage: item.homepage })))
        .sort((left, right) => left.name.localeCompare(right.name) || left.license.localeCompare(right.license));
    return [
        `## ${title}`,
        "",
        `共 ${rows.length} 个运行时依赖记录。`,
        "",
        "| 包 | 版本 | 许可证 | 项目主页 |",
        "| --- | --- | --- | --- |",
        ...rows.map((item) => `| ${cell(item.name)} | ${cell((item.versions || []).join(", "))} | ${cell(item.license)} | ${link(item.homepage)} |`),
        "",
    ];
}

function licenseInventory(cwd) {
    const executable = process.platform === "win32" ? { command: "cmd.exe", args: ["/d", "/s", "/c", "pnpm licenses list --json --prod"] } : { command: "pnpm", args: ["licenses", "list", "--json", "--prod"] };
    const result = spawnSync(executable.command, executable.args, { cwd, encoding: "utf8" });
    if (result.error || result.status !== 0) throw new Error(`无法读取 ${path.basename(cwd)} 依赖许可证：${result.error?.message || result.stderr || result.status}`);
    return JSON.parse(result.stdout);
}

function cell(value) {
    return String(value || "-")
        .replaceAll("|", "\\|")
        .replaceAll("\n", " ");
}

function link(value) {
    const url = String(value || "").trim();
    return /^https?:\/\//i.test(url) ? `[链接](${url.replaceAll(")", "%29")})` : "-";
}
