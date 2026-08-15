# FlowCanvas 画布移植适配映射表（工作文档）

目标：用 FlowCanvas（无限画布，LeaferJS）的画布模块替换 VOZEB 画布，其余全部沿用 VOZEB。
移植代码位于 `web/src/flowcanvas/`（从 FlowCanvas `web/src` 拷贝，`@/` 引用已改写为 `@/flowcanvas/`）。

## 映射总表

| FlowCanvas（原） | VOZEB（现） | 适配方式 | 状态 |
| --- | --- | --- | --- |
| `/api/auth/*` + Bearer token | Cookie 会话 + `GET /api/auth/session` | user store 的 token 置占位值，请求不再带 Authorization | ⏳ |
| `/api/user/bootstrap`（config+projects+assets 全量） | `/api/auth/session` + `/api/canvas/projects`（摘要） + `/api/canvas/projects/:id`（全量） + `/api/library-assets` | 适配层聚合出同等结构；项目全量按需逐个拉 | ⏳ |
| `PUT /api/user/projects`（整表+墓碑） | `PATCH /api/canvas-projects/:id`（全量带 expectedUpdatedAt）+ `DELETE /api/canvas/projects` | 适配层按 dirty 项目逐个 PATCH、墓碑逐个 DELETE | ⏳ |
| `PUT /api/user/config` | 暂无用户级配置接口（设置是站点级） | v1：配置变更只留内存/本地，不上屏（后续可加） | ⏳ |
| `/api/user/files` 上传 + `/files/sign` 签名 | `POST /api/reference-assets {dataUrl,persistent:true}` → `{url,key}`；读取 `/api/reference-assets/<key>`（Cookie 鉴权，无需签名） | image-storage/file-storage 的 backend: 分支改写 | ⏳ |
| `/api/model-runtime/models/{id}/*` 代理 | `/api/ai/system/<channelId>/*` OpenAI/Gemini 透传 | runtime-config 用 systemChannels 重建渠道（apiKey 占位 "system"） | ⏳ |
| `/api/runtime-config` 模型目录 | `/api/auth/session` 的 `settings.logicalModels` + `systemChannels` + `defaultModels` | runtime-config.ts 重写 | ⏳ |
| `/api/model-capabilities/{image,video,audio}` | 无（能力在 logicalModels.capabilityProfile，不下发） | 合成宽松默认能力 | ⏳ |
| 图片/视频/音频生成（直连代理路径） | 任务 API：`/api/image-tasks`、`/api/video-generation-tasks`+`/api/video-tasks/:id`、`/api/audio-tasks`（服务端执行 + Worker） | 生成 service 改写为任务创建+轮询 | ⏳ |
| 文本模型调用（/chat/completions 工具调用） | `/api/ai/system/<channelId>/chat/completions` 透传 | 直接用，渠道路径即可 | ⏳ |
| Agent Run（我们的 /api/agent-runs） | VOZEB `/api/agent/runs`（SSE + canvas.ops） | v1 隐藏「任务规划」入口，后续接 VOZEB run 客户端 | ⏳ |
| `/api/canvas-templates`（工具箱模板） | 无 | v1 工具箱模板只读本地空列表，后续映射 library-assets | ⏳ |
| `/api/comfyui-proxy`、`/api/workflows` | 无（VOZEB 无 ComfyUI） | v1 ComfyUI 节点不可用，UI 保留但执行报错 | ⏳ |
| `/api/prompts` | `/api/prompts`（形状近似） | 字段映射微调 | ⏳ |
| 素材库 `PUT /api/user/assets` | `/api/library-assets`（CRUD） | 形状映射（kind/data/metadata） | ⏳ |
| 生成记录 `/api/user/generation-logs` | `/api/generation-logs` | 字段映射 | ⏳ |
| localforage 本地媒体缓存 | 不需要 | 保留代码（浏览器内可用），`image:`/`file:` 键仍走本地 | ✅ |
| localStorage 小状态（主题、Agent 设置） | 同 | 直接用 | ✅ |

## 硬性改造点

- `constant/env.ts`：`import.meta.env` → 同源路径（`apiUrl(p) => p`）
- `agent-skills/loader.ts`：`import.meta.glob` → 构建期生成静态 manifest
- `director/storyai/.../ue4MannequinRig.ts`：`import.meta.env.BASE_URL` → `"/"`
- npm 依赖补齐：leafer-ui + @leafer-in/*、three + three-stdlib、localforage、axios、fflate、file-saver、copy-to-clipboard、motion 等（对照 FlowCanvas web/package.json）
- 页面挂载：`(user)/canvas/page.tsx` 与 `(user)/canvas/[id]/page.tsx` 换成 FlowCanvas 实现（VOZEB 原版在 git 历史里）

## 阶段划分

1. 机械落地 + 编译通过 + 画布能打开（本地/空数据） 
2. 持久化打通（项目 CRUD + 媒体上传读取）
3. 模型目录 + 生成任务（图/视/音/文）
4. Agent（对话操作接透传代理；任务规划接 VOZEB Agent Run）
5. 资产/提示词/生成记录/工具箱模板等边缘能力
