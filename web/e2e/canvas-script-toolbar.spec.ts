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

/** 元素中心点可能超出视口（画布世界原点居中，节点只露出一部分），钳制到视口内且仍落在元素上的点。 */
function clampPointToViewport(page: Page, box: { x: number; y: number; width: number; height: number }) {
    const { width, height } = page.viewportSize() ?? { width: 1280, height: 720 };
    return {
        x: Math.max(box.x + 4, Math.min(box.x + box.width / 2, Math.min(box.x + box.width - 4, width - 8))),
        y: Math.max(box.y + 4, Math.min(box.y + box.height / 2, Math.min(box.y + box.height - 4, height - 8))),
    };
}

async function mouseHover(page: Page, locator: Locator) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    const point = clampPointToViewport(page, box!);
    await page.mouse.move(point.x, point.y);
}

async function mouseClick(page: Page, locator: Locator) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    const point = clampPointToViewport(page, box!);
    await page.mouse.click(point.x, point.y);
}

/** 节点悬停出工具条：画布恢复期间 pointerenter 可能尚未挂载，鼠标停在节点上不会再触发 enter，小幅抖动重试直到工具条出现。 */
async function hoverNodeUntilToolbar(page: Page, nodeId: string, toolbarButton: Locator) {
    const node = page.locator(`[data-node-id="${nodeId}"]`);
    await expect(node).toBeVisible({ timeout: 30_000 });
    await expect(async () => {
        const box = await node.boundingBox();
        expect(box).not.toBeNull();
        const point = clampPointToViewport(page, box!);
        await page.mouse.move(point.x, point.y);
        await page.mouse.move(point.x + 2, point.y + 2);
        await expect(toolbarButton).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 25_000, intervals: [800, 1200, 2000] });
}

async function openScriptToolbar(page: Page) {
    const storyboardButton = page.getByRole("button", { name: /批量生成分镜/ }).first();
    await hoverNodeUntilToolbar(page, "script-1", storyboardButton);
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

// —— 步骤 2/3 全量点击回归：准备资产与合成提示词的每个可操作入口都必须真实生效 ——

type CanvasNodePayload = { id: string; title: string; metadata?: Record<string, unknown> };

async function readAllNodes(request: APIRequestContext, id: string): Promise<CanvasNodePayload[]> {
    const response = await request.get(`/api/canvas/projects/${id}`);
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { project: { nodes: CanvasNodePayload[] } } }).data.project.nodes;
}

function assetProject() {
    return {
        title: `脚本步骤回归 ${randomUUID().slice(0, 8)}`,
        viewport: { x: 0, y: 0, k: 1 },
        nodes: [
            {
                id: "script-1",
                type: "text",
                title: "分镜脚本",
                position: { x: -520, y: 120 },
                width: 420,
                height: 320,
                metadata: {
                    canvasTool: "script",
                    scriptTitle: "测试剧本",
                    content: "开场\n发现信号",
                    scriptBody: "开场\n发现信号",
                    scriptBeats: SCRIPT_BEATS.slice(0, 2),
                    scriptAssets: [{ id: "asset-1", kind: "character", name: "沈昭昭", description: "唐代女官，绯色官服" }],
                    status: "success",
                },
            },
        ],
        connections: [],
    };
}

/** 脚本/导演台节点双击开工作台（对齐画布既有手势契约），不依赖悬停工具条。 */
async function openStudio(page: Page) {
    const node = page.locator('[data-node-id="script-1"]');
    await expect(node).toBeVisible({ timeout: 30_000 });
    const box = await node.boundingBox();
    expect(box).not.toBeNull();
    const point = clampPointToViewport(page, box!);
    await page.mouse.dblclick(point.x, point.y);
    await expect(page.getByText("确认镜头").first()).toBeVisible({ timeout: 10_000 });
}

test("studio step 2 prepare assets: add asset, batch fill creates named nodes, single generate closes studio and opens composer", async ({ page, request }) => {
    const project = await createCanvasProject(request, assetProject());
    try {
        await page.goto(`/canvas/${project.id}`, { waitUntil: "domcontentloaded" });
        await openStudio(page);

        // 进入步骤 2「准备资产」（原始鼠标点击，绕开命中检查——若这一步仍不切换说明顶栏有真实遮挡）
        await mouseClick(page, page.getByRole("button", { name: /准备资产/ }).first());
        await expect(page.getByText("检测到 1 个资产还没有设定图")).toBeVisible({ timeout: 8_000 });

        // 添加资产：选择「道具」类型并填写名称（虚拟列表用键盘导航，不依赖渲染项）
        await page.locator(".ant-select").first().click();
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await expect(page.locator(".ant-select").first()).toContainText("道具");
        await page.getByPlaceholder("资产名称").fill("佩刀");
        await page.getByRole("button", { name: /添加资产/ }).click();
        await expect(page.getByPlaceholder("名称").nth(1)).toHaveValue("佩刀");
        await expect(page.getByText("检测到 2 个资产还没有设定图")).toBeVisible();

        // 一键补齐设定图：画布落节点并按「角色/道具·名称」命名
        await page.getByRole("button", { name: /一键补齐设定图/ }).click();
        await expect(page.locator(".ant-message")).toContainText("已为 2 个资产创建设定图节点", { timeout: 8_000 });
        await page.getByRole("button", { name: "关闭脚本工作台" }).click();
        await expect
            .poll(async () => (await readAllNodes(request, project.id)).length, { timeout: 10_000 })
            .toBe(3);
        let titles = (await readAllNodes(request, project.id)).map((node) => node.title);
        expect(titles).toContain("角色·沈昭昭");
        expect(titles).toContain("道具·佩刀");

        // 单个资产「生成资产图」：必须关闭全屏工作台并打开 composer 确认卡片（此前 composer 被 z-220 工作台盖住，点了像没反应）
        await openStudio(page);
        await mouseClick(page, page.getByRole("button", { name: /准备资产/ }).first());
        await expect(page.getByText(/检测到 \d+ 个资产还没有设定图/)).toBeVisible({ timeout: 8_000 });
        await page.getByRole("button", { name: /生成资产图/ }).first().click();
        await page.getByRole("menuitem", { name: /图片节点生成/ }).click();
        await expect(page.getByRole("button", { name: /准备资产/ }).first()).toHaveCount(0);
        await expect(page.locator("[data-canvas-composer]")).toBeVisible({ timeout: 10_000 });
        // 重复生成替换旧节点而不是叠加：画布上同一资产只保留最新一个设定图节点
        await expect
            .poll(async () => (await readAllNodes(request, project.id)).filter((node) => node.title === "角色·沈昭昭").length, { timeout: 10_000 })
            .toBe(1);
        titles = (await readAllNodes(request, project.id)).map((node) => node.title);
        expect(titles).toContain("道具·佩刀");
    } finally {
        await deleteCanvasProject(request, project.id);
    }
});

test("studio step 3 synthesize prompts: dual-track edit modal persists, smart synthesize and synthesize-all give real feedback", async ({ page, request }) => {
    const project = await createCanvasProject(request, assetProject());
    try {
        await page.goto(`/canvas/${project.id}`, { waitUntil: "domcontentloaded" });
        await openStudio(page);

        // 进入步骤 3「合成提示词」
        await mouseClick(page, page.getByRole("button", { name: /合成提示词/ }).first());
        await expect(page.getByText("帧图未合成").first()).toBeVisible({ timeout: 8_000 });
        await expect(page.getByText("运动未合成").first()).toBeVisible();

        // 查看/编辑弹窗：双 textarea 可编辑并持久化到服务端
        await page.getByRole("button", { name: "查看/编辑" }).first().click();
        await expect(page.getByText("第 1 镜：双轨提示词")).toBeVisible();
        await page.getByPlaceholder(/留空自动合成/).fill("自定义帧图提示词：控制室全景，电影感");
        await expect
            .poll(async () => {
                const nodes = await readAllNodes(request, project.id);
                const beats = (nodes[0]?.metadata?.scriptBeats as Array<{ imagePrompt?: string }> | undefined) ?? [];
                return beats[0]?.imagePrompt ?? "";
            }, { timeout: 10_000 })
            .toBe("自定义帧图提示词：控制室全景，电影感");
        await page.locator(".ant-modal-close").click();

        // 智能合成：必须给出真实反馈（加载 → 成功或可读错误），不允许点了没反应
        await page.getByRole("button", { name: "智能合成", exact: true }).first().click();
        await expect(page.locator(".ant-message")).toContainText(/正在智能合成/, { timeout: 8_000 });
        await expect(page.locator(".ant-message")).toContainText(/已合成分镜图与视频运动提示词|没有返回可识别|失败|不可用/, { timeout: 20_000 });

        // 一键合成全部提示词：按钮可点并出现忙碌/反馈
        await page.getByRole("button", { name: /一键合成全部提示词/ }).click();
        await expect(page.locator(".ant-message")).toContainText(/正在智能合成/, { timeout: 8_000 });
    } finally {
        await deleteCanvasProject(request, project.id);
    }
});
