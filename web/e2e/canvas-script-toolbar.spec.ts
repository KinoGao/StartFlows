import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

// 脚本节点浮动工具栏对齐 LibTV：生成分镜/生成视频不再一键直铺节点，
// 而是打开工作台并直出对应批量导出门槛清单 + 逐镜勾选确认；派生节点按镜号命名；整组执行已全量移除。
// 注意：flowcanvas 的 Leafer 交互层覆盖节点 DOM，locator.hover()/click() 的命中检查会永久等待，
// 节点与工具条按钮一律用 boundingBox + 原生 mouse 事件驱动。

const SCRIPT_BEATS = [
    { id: "beat-1", title: "开场", content: "主角进入控制室，屏幕亮起", prompt: "控制室全景，电影感" },
    { id: "beat-2", title: "发现信号", content: "屏幕跳出绿色尖峰", prompt: "屏幕特写" },
    { id: "beat-3", title: "呼叫", content: "主角按下红色按钮", prompt: "手指特写" },
];

function scriptProject() {
    return {
        title: `脚本工具栏回归 ${randomUUID().slice(0, 8)}`,
        viewport: { x: 0, y: 0, k: 1 },
        nodes: [
            {
                id: "script-1",
                type: "text",
                title: "分镜脚本",
                position: { x: 120, y: 120 },
                width: 420,
                height: 320,
                metadata: {
                    canvasTool: "script",
                    scriptTitle: "测试剧本",
                    content: "开场\n发现信号\n呼叫",
                    scriptBody: "开场\n发现信号\n呼叫",
                    scriptBeats: SCRIPT_BEATS,
                    status: "success",
                },
            },
        ],
        connections: [],
    };
}

async function createCanvasProject(request: APIRequestContext, project: Record<string, unknown>) {
    const response = await request.post("/api/canvas/projects", { data: { title: project.title, project } });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { project: { id: string } } }).data.project;
}

async function deleteCanvasProject(request: APIRequestContext, id: string) {
    const response = await request.delete("/api/canvas/projects", { data: { ids: [id] } });
    expect(response.ok(), await response.text()).toBe(true);
}

async function readNodes(request: APIRequestContext, id: string) {
    const response = await request.get(`/api/canvas/projects/${id}`);
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { project: { nodes: Array<{ title: string; metadata?: { status?: string } }> } } }).data.project.nodes;
}

async function mouseHover(page: Page, locator: Locator) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

async function mouseClick(page: Page, locator: Locator) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

async function openScriptToolbar(page: Page) {
    const scriptNode = page.locator('[data-node-id="script-1"]');
    await expect(scriptNode).toBeVisible({ timeout: 30_000 });
    await mouseHover(page, scriptNode);
    const storyboardButton = page.getByRole("button", { name: /批量生成分镜/ }).first();
    await expect(storyboardButton).toBeVisible({ timeout: 10_000 });
    return storyboardButton;
}

test("script node toolbar routes batch actions through the gated export confirm and names derived nodes", async ({ page, request }) => {
    const project = await createCanvasProject(request, scriptProject());
    try {
        await page.goto(`/canvas/${project.id}`, { waitUntil: "domcontentloaded" });

        // 整组执行已全量移除（LibTV 无此功能）
        const storyboardButton = await openScriptToolbar(page);
        await expect(page.getByText("整组执行")).toHaveCount(0);
        await expect(page.getByRole("button", { name: /批量生视频/ }).first()).toBeVisible();

        await mouseClick(page, storyboardButton);
        // 打开脚本工作台
        await expect(page.getByText("确认镜头").first()).toBeVisible({ timeout: 10_000 });
        // 未合成提示词时先出 LibTV 式门槛清单
        await expect(page.getByText("批量导出前，建议先完成：")).toBeVisible({ timeout: 8_000 });
        await page.getByRole("button", { name: "仍要导出" }).click();
        // 逐镜勾选确认弹层
        await expect(page.getByText("批量导出分镜图节点")).toBeVisible({ timeout: 8_000 });
        await page.getByRole("button", { name: /确认导出/ }).click();

        // 回读服务端：派生节点按镜号命名，且没有自动开始批量生成
        await expect
            .poll(async () => (await readNodes(request, project.id)).length, { timeout: 10_000 })
            .toBe(4);
        const nodes = await readNodes(request, project.id);
        const titles = nodes.map((node) => node.title);
        expect(titles).toContain("分镜图 #1·开场");
        expect(titles).toContain("分镜图 #2·发现信号");
        expect(titles).toContain("分镜图 #3·呼叫");
        expect(nodes.filter((node) => node.metadata?.status === "running")).toHaveLength(0);
    } finally {
        await deleteCanvasProject(request, project.id);
    }
});

test("script node toolbar video entry opens the studio with the video export confirm", async ({ page, request }) => {
    const project = await createCanvasProject(request, scriptProject());
    try {
        await page.goto(`/canvas/${project.id}`, { waitUntil: "domcontentloaded" });

        await openScriptToolbar(page);
        await mouseClick(page, page.getByRole("button", { name: /批量生视频/ }).first());
        await expect(page.getByText("确认镜头").first()).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText("批量导出前，建议先完成：")).toBeVisible({ timeout: 8_000 });
        await page.getByRole("button", { name: "仍要导出" }).click();
        await expect(page.getByText("批量导出视频节点")).toBeVisible({ timeout: 8_000 });
        // 不确认导出，直接关闭弹层：画布不得多出任何节点（无一键直铺）
        await page.keyboard.press("Escape");
        await expect.poll(async () => (await readNodes(request, project.id)).length).toBe(1);
    } finally {
        await deleteCanvasProject(request, project.id);
    }
});
