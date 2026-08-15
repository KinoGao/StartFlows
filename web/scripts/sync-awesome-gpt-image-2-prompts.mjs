import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { jsonrepair } from "jsonrepair";
import { decodeHTML } from "entities";

const REPOSITORY = "tigerowo/awesome-gpt-image-2-prompts";
const COMMIT = "60e9c65baecfd6d6d51ac4e4d87f146af834bb64";
const SOURCE_DIR = process.env.AWESOME_GPT_IMAGE_2_SOURCE_DIR?.trim();
const CASES = [
    ["ad-creative", "广告创意"],
    ["character", "角色设计"],
    ["comparison", "对比评测"],
    ["ecommerce", "电商商品"],
    ["portrait", "人像摄影"],
    ["poster", "海报设计"],
    ["ui", "UI 与社交媒体"],
];
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(scriptDir, "../src/lib/prompts/original-author-seeds.json");
const skippedCases = [];

const seeds = (
    await Promise.all(
        CASES.map(async ([slug, category]) => {
            const fileName = `${slug}_zh-CN.md`;
            return parseCases(await readCaseFile(fileName), { slug, category, fileName });
        }),
    )
).flat();

const ids = new Set(seeds.map((seed) => seed.id));
if (seeds.length < 900) throw new Error(`提示词数量异常：仅解析到 ${seeds.length} 条`);
if (ids.size !== seeds.length) throw new Error("提示词 ID 存在重复");
if (seeds.some((seed) => !seed.prompt || !seed.coverUrl)) throw new Error("提示词内容或封面缺失");
const codeLikeSeeds = seeds.filter((seed) => containsRawPromptCode(seed.prompt));
if (codeLikeSeeds.length) throw new Error(`仍有代码格式提示词：${codeLikeSeeds.map((seed) => seed.id).join("、")}`);

await writeFile(outputPath, `${JSON.stringify(seeds, null, 4)}\n`, "utf8");
console.log(`已同步 ${seeds.length} 条提示词到 ${outputPath}`);
if (skippedCases.length) console.warn(`上游有 ${skippedCases.length} 个案例缺少提示词或输出图，已跳过：${skippedCases.join("、")}`);

async function readCaseFile(fileName) {
    if (SOURCE_DIR) return readFile(path.join(SOURCE_DIR, "cases", fileName), "utf8");
    const url = `https://raw.githubusercontent.com/${REPOSITORY}/${COMMIT}/cases/${fileName}`;
    const response = await fetch(url, { headers: { Accept: "text/markdown", "User-Agent": "VOZEB-PRO prompt sync" } });
    if (!response.ok) throw new Error(`读取 ${fileName} 失败：HTTP ${response.status}`);
    return response.text();
}

function parseCases(markdown, { slug, category, fileName }) {
    const headers = [...markdown.matchAll(/^### Case\s+(\d+):\s+(.+)$/gm)];
    return headers.flatMap((match, index) => {
        const block = markdown.slice(match.index, headers[index + 1]?.index ?? markdown.length);
        const linkedHeader = match[2].trim().match(/^\[([^\]]+)]\(([^)]+)\)(?:\s+\(by\s+(?:\[([^\]]+)]\(([^)]+)\)|([^)]+))\))?/);
        const sourceLine = block.match(/\*\*Source\*\*\s*:\s*\[([^\]]+)]\(([^)]+)\)/i);
        const prompt = block.match(/\*\*(?:提示词|Prompt)[^*]*\*\*\s*[：:]?[\s\S]*?```(?:[^\r\n]*)\r?\n([\s\S]*?)\r?\n```/i)?.[1]?.trim();
        const imagePath = block.match(/\.\.\/(images\/[a-z0-9_-]+_case\d+\/[a-z0-9_-]+\.(?:jpe?g|png|webp))/i)?.[1];
        if (!prompt || !imagePath) {
            skippedCases.push(`${fileName}#${match[1]}`);
            return [];
        }
        const caseNumber = Number(match[1]);
        const originalUrl = linkedHeader?.[2] && linkedHeader[2] !== "#" ? linkedHeader[2] : sourceLine?.[2] || "未注明";
        const author = linkedHeader?.[3] || linkedHeader?.[5] || sourceLine?.[1] || "未注明";
        const authorUrl = linkedHeader?.[4] || sourceLine?.[2] || "";
        return [
            {
                id: `awesome-gpt-image-2-${slug}-${String(caseNumber).padStart(4, "0")}`,
                title: cleanTitle(linkedHeader?.[1] || match[2]),
                coverUrl: `/api/public/prompt-images?path=${encodeURIComponent(imagePath)}`,
                prompt: normalizePromptContent(prompt),
                tags: ["GPT Image 2", category],
                category,
                preview: [`来源项目：${REPOSITORY}`, `原作者：${author}${authorUrl ? `（${authorUrl}）` : ""}`, `原始发布：${originalUrl}`, "许可：CC0 1.0 Universal"].join("\n"),
                githubUrl: `https://github.com/${REPOSITORY}/blob/${COMMIT}/cases/${fileName}`,
            },
        ];
    });
}

function cleanTitle(value) {
    return decodeHTML(value).trim();
}

function normalizePromptContent(value) {
    const prompt = value.trim();
    if (!prompt) return "";
    const structured = parseStructuredPrompt(prompt);
    if (structured) return formatStructuredPrompt(replaceStructuredArguments(structured));
    return replaceArgumentTemplates(prompt);
}

function parseStructuredPrompt(value) {
    for (const candidate of structuredPromptCandidates(value)) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === "object") return parsed;
        } catch {
            try {
                const parsed = JSON.parse(jsonrepair(candidate));
                if (parsed && typeof parsed === "object") return parsed;
            } catch {
                // Upstream natural-language prompts may contain braces that are not structured data.
            }
        }
    }
    return null;
}

function structuredPromptCandidates(value) {
    const candidates = [];
    const trimmed = value.trim();
    if (/^\{/.test(trimmed) || /^\[\s*(?:[\[{"']|-?\d|true\b|false\b|null\b)/i.test(trimmed)) candidates.push(trimmed);

    const objectStart = value.search(/\{\s*(?:["'][^"'\r\n]+["']|[a-z_][\w-]*)\s*:/i);
    const objectEnd = value.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) candidates.push(value.slice(objectStart, objectEnd + 1));

    return [...new Set(candidates)];
}

function replaceStructuredArguments(value) {
    if (typeof value === "string") return replaceArgumentTemplates(value);
    if (Array.isArray(value)) return value.map(replaceStructuredArguments);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceStructuredArguments(item)]));
    return value;
}

function replaceArgumentTemplates(value) {
    return value.replace(/\{argument\s+name=\\?"(?:\\.|[^"\\])*\\?"\s+default=\\?"((?:\\.|[^"\\])*)\\?"\}/gi, (_match, defaultValue) => defaultValue.replaceAll('\\"', '"').replaceAll("\\\\", "\\"));
}

function containsRawPromptCode(value) {
    return /\{argument\b|```|~~~|(?:^|\n)\s*["'][^"'\r\n]+["']\s*:\s*/i.test(value);
}

function formatStructuredPrompt(value, depth = 0) {
    const indent = "  ".repeat(depth);
    if (Array.isArray(value)) {
        if (value.every(isPrimitive)) return value.map(formatPrimitive).join("、");
        return value.map((item) => `${indent}- ${isPrimitive(item) ? formatPrimitive(item) : `\n${formatStructuredPrompt(item, depth + 1)}`}`).join("\n");
    }
    if (!value || typeof value !== "object") return `${indent}${formatPrimitive(value)}`;
    return Object.entries(value)
        .map(([key, item]) => {
            const label = promptKeyLabel(key);
            if (isPrimitive(item)) return `${indent}${label}：${formatPrimitive(item)}`;
            if (Array.isArray(item) && item.every(isPrimitive)) return `${indent}${label}：${item.map(formatPrimitive).join("、")}`;
            return `${indent}${label}：\n${formatStructuredPrompt(item, depth + 1)}`;
        })
        .join("\n");
}

function isPrimitive(value) {
    return value === null || typeof value !== "object";
}

function formatPrimitive(value) {
    if (value === true) return "是";
    if (value === false) return "否";
    if (value === null || value === undefined) return "";
    return String(value);
}

function promptKeyLabel(value) {
    const labels = {
        type: "类型",
        brand: "品牌",
        name: "名称",
        industry: "行业",
        colors: "配色",
        subject: "主体",
        layout: "布局",
        grid: "网格",
        sections: "分区",
        title: "标题",
        elements: "元素",
        position: "位置",
        theme: "主题",
        background: "背景",
        composition: "构图",
        camera: "镜头",
        lighting: "光线",
        mood: "氛围",
        quality: "质量",
        style: "风格",
        labels: "文案",
        text_labels: "文字",
        badges: "徽章",
        count: "数量",
        outfit: "服装",
        negative_prompt: "负面提示",
    };
    return labels[value] || value.replaceAll("_", " ");
}
