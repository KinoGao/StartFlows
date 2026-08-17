"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Form, Input, InputNumber, Modal, Select, Switch } from "antd";
import { Pencil, PlugZap, RefreshCw, Trash2, Upload } from "lucide-react";

import {
    COMFY_CAPABILITY_META,
    inferComfyWorkflowCapability,
    listComfyWorkflowInputCandidates,
    parseComfyWorkflowJson,
    type ComfyUiCapability,
    type ComfyWorkflowField,
    type ComfyWorkflowJson,
} from "@/flowcanvas/services/comfyui-workflows";

type ComfyUiConfig = {
    enabled: boolean;
    baseUrl: string;
    clientId: string;
    defaultWorkflowId: string;
    timeoutSeconds: number;
    pollIntervalMs: number;
};

type WorkflowItem = {
    id: string;
    name: string;
    title: string;
    capability?: string;
    workflow: ComfyWorkflowJson;
    fields: ComfyWorkflowField[];
    updatedAt: string;
};

type FieldDraft = ComfyWorkflowField;

const CAPABILITY_OPTIONS = Object.entries(COMFY_CAPABILITY_META).map(([value, meta]) => ({ value, label: meta.label }));

const FIELD_TYPE_OPTIONS = [
    { value: "text", label: "单行文本" },
    { value: "textarea", label: "多行文本" },
    { value: "number", label: "数字" },
    { value: "slider", label: "滑杆" },
    { value: "dropdown", label: "下拉选择" },
    { value: "boolean", label: "开关" },
    { value: "image", label: "图片" },
    { value: "video", label: "视频" },
    { value: "audio", label: "音频" },
];

function fieldKey(field: Pick<ComfyWorkflowField, "node" | "input">) {
    return `${field.node}:${field.input}`;
}

export function AdminComfyUiSection() {
    const { message, modal } = App.useApp();
    const [form] = Form.useForm<ComfyUiConfig>();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    const [workflows, setWorkflows] = useState<WorkflowItem[] | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editorSaving, setEditorSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editorName, setEditorName] = useState("");
    const [editorTitle, setEditorTitle] = useState("");
    const [editorCapability, setEditorCapability] = useState<ComfyUiCapability | "">("");
    const [editorFields, setEditorFields] = useState<FieldDraft[]>([]);
    const [editorWorkflow, setEditorWorkflow] = useState<ComfyWorkflowJson | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadWorkflows = async () => {
        try {
            const response = await fetch("/api/workflows");
            const body = (await response.json()) as { data?: WorkflowItem[]; msg?: string };
            if (!response.ok || !Array.isArray(body.data)) throw new Error(body.msg || "工作流列表读取失败");
            setWorkflows(body.data);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "工作流列表读取失败");
        }
    };

    useEffect(() => {
        void (async () => {
            try {
                const response = await fetch("/api/comfyui-config");
                const body = (await response.json()) as { comfyui?: ComfyUiConfig; error?: string };
                if (!response.ok || !body.comfyui) throw new Error(body.error || "ComfyUI 配置加载失败");
                form.setFieldsValue(body.comfyui);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "ComfyUI 配置加载失败");
            } finally {
                setLoading(false);
            }
        })();
        void loadWorkflows();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const save = async (values: ComfyUiConfig) => {
        setSaving(true);
        try {
            const response = await fetch("/api/comfyui-config", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });
            const body = (await response.json()) as { comfyui?: ComfyUiConfig; error?: string };
            if (!response.ok || !body.comfyui) throw new Error(body.error || "保存失败");
            form.setFieldsValue(body.comfyui);
            message.success("ComfyUI 配置已保存，画布端即时生效");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "ComfyUI 配置保存失败");
        } finally {
            setSaving(false);
        }
    };

    const testConnection = async () => {
        setTesting(true);
        try {
            // 代理强制使用已保存的后台地址；先保存再测试才能得到新地址的结果
            const response = await fetch("/api/comfyui-proxy", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ baseUrl: "", path: "/system_stats", method: "GET" }),
            });
            if (!response.ok) throw new Error((await response.text()).slice(0, 200) || `HTTP ${response.status}`);
            const stats = (await response.json()) as { system?: { comfyui_version?: string } };
            message.success(`连接成功${stats.system?.comfyui_version ? `：ComfyUI ${stats.system.comfyui_version}` : ""}`);
        } catch (error) {
            message.error(`连接失败：${error instanceof Error ? error.message : "未知错误"}`);
        } finally {
            setTesting(false);
        }
    };

    const openUploadEditor = async (file: File) => {
        try {
            const workflow = parseComfyWorkflowJson(await file.text());
            const name = file.name.replace(/\.json$/i, "").trim() || "未命名工作流";
            const fields: FieldDraft[] = listComfyWorkflowInputCandidates(workflow).map((candidate) => candidate.field);
            setEditingId(null);
            setEditorWorkflow(workflow);
            setEditorName(name);
            setEditorTitle(name);
            setEditorCapability(inferComfyWorkflowCapability(workflow, fields));
            setEditorFields(fields);
            setEditorOpen(true);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "工作流 JSON 解析失败");
        }
    };

    const openEditEditor = (item: WorkflowItem) => {
        // 兼容无字段配置的历史工作流（如 API 直接上传）：打开编辑时从工作流 JSON 重新推导
        const inferredFields = item.fields?.length ? item.fields : listComfyWorkflowInputCandidates(item.workflow).map((candidate) => candidate.field);
        setEditingId(item.id);
        setEditorWorkflow(item.workflow);
        setEditorName(item.name);
        setEditorTitle(item.title);
        setEditorCapability((item.capability || inferComfyWorkflowCapability(item.workflow, inferredFields) || "") as ComfyUiCapability | "");
        setEditorFields(inferredFields.map((field) => ({ ...field })));
        setEditorOpen(true);
    };

    const updateEditorField = (index: number, patch: Partial<ComfyWorkflowField>) => setEditorFields((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));

    const addEditorCandidate = (key: string) => {
        if (!editorWorkflow) return;
        const candidate = listComfyWorkflowInputCandidates(editorWorkflow).find((item) => fieldKey(item.field) === key);
        if (!candidate || editorFields.some((field) => fieldKey(field) === key)) return;
        setEditorFields((current) => [...current, candidate.field]);
    };

    const saveEditor = async () => {
        const title = editorTitle.trim() || editorName.trim() || "未命名工作流";
        const fields = editorFields;
        setEditorSaving(true);
        try {
            let id = editingId;
            if (!id) {
                if (!editorWorkflow) throw new Error("缺少工作流 JSON");
                const response = await fetch("/api/workflows/upload", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: editorName.trim() || title, workflow: editorWorkflow }),
                });
                const body = (await response.json()) as { data?: WorkflowItem; msg?: string; error?: string };
                if (!response.ok || !body.data) throw new Error(body.msg || body.error || "工作流上传失败");
                id = body.data.id;
            }
            const response = await fetch(`/api/workflows/${encodeURIComponent(id)}/config`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, fields, capability: editorCapability }),
            });
            const body = (await response.json()) as { data?: WorkflowItem; msg?: string; error?: string };
            if (!response.ok || !body.data) throw new Error(body.msg || body.error || "工作流配置保存失败");
            message.success(editingId ? "工作流已更新" : "工作流已上传");
            setEditorOpen(false);
            await loadWorkflows();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "工作流保存失败");
        } finally {
            setEditorSaving(false);
        }
    };

    const removeWorkflow = (item: WorkflowItem) => {
        modal.confirm({
            title: `删除工作流「${item.title}」？`,
            content: "删除后画布节点将无法再选用这套工作流，已创建的节点不受影响。",
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                const response = await fetch(`/api/workflows/${encodeURIComponent(item.id)}`, { method: "DELETE" });
                if (!response.ok) throw new Error("删除失败");
                message.success("工作流已删除");
                await loadWorkflows();
            },
        });
    };

    const capabilityLabel = useMemo(() => {
        const labels = new Map(CAPABILITY_OPTIONS.map((option) => [option.value, option.label]));
        return (value?: string) => (value ? labels.get(value as ComfyUiCapability) || value : "自动识别");
    }, []);

    return (
        <div className="max-w-3xl space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="mb-4">
                    <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">ComfyUI 服务</h2>
                    <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                        画布 ComfyUI 节点经服务端代理访问本地 ComfyUI；地址只保存在服务端，不下发到浏览器。保存后立即生效，无需重启。
                    </p>
                </div>
                <Form form={form} layout="vertical" requiredMark={false} disabled={loading} onFinish={(values) => void save(values)}>
                    <Form.Item name="enabled" label="启用 ComfyUI 节点" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                    <Form.Item name="baseUrl" label="ComfyUI 地址" rules={[{ required: true, message: "请输入 ComfyUI 地址" }]}>
                        <Input placeholder="http://127.0.0.1:8188" />
                    </Form.Item>
                    <div className="grid gap-x-4 sm:grid-cols-2">
                        <Form.Item name="clientId" label="客户端标识（client_id）">
                            <Input placeholder="flow-canvas" />
                        </Form.Item>
                        <Form.Item name="defaultWorkflowId" label="默认工作流 ID（可空）">
                            <Input placeholder="留空则由节点选择" />
                        </Form.Item>
                    </div>
                    <div className="grid gap-x-4 sm:grid-cols-2">
                        <Form.Item name="timeoutSeconds" label="任务超时（秒）" rules={[{ required: true, message: "请输入超时时间" }]}>
                            <InputNumber className="w-full" min={10} max={86400} precision={0} />
                        </Form.Item>
                        <Form.Item name="pollIntervalMs" label="轮询间隔（毫秒）" rules={[{ required: true, message: "请输入轮询间隔" }]}>
                            <InputNumber className="w-full" min={200} max={60000} precision={0} />
                        </Form.Item>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button type="primary" htmlType="submit" loading={saving}>
                            保存配置
                        </Button>
                        <Button icon={<PlugZap className="size-4" />} loading={testing} onClick={() => void testConnection()}>
                            测试连接
                        </Button>
                    </div>
                </Form>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">工作流库</h2>
                        <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                            上传 ComfyUI 导出的 API 格式 workflow JSON，自动推导参数表单；画布 ComfyUI 节点可直接选用。
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button icon={<RefreshCw className="size-4" />} onClick={() => void loadWorkflows()}>
                            刷新
                        </Button>
                        <Button type="primary" icon={<Upload className="size-4" />} onClick={() => fileInputRef.current?.click()}>
                            上传工作流
                        </Button>
                    </div>
                </div>
                {workflows === null ? (
                    <div className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">正在读取工作流列表…</div>
                ) : workflows.length === 0 ? (
                    <div className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">还没有工作流，点击右上角「上传工作流」添加。</div>
                ) : (
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                        {workflows.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.title}</div>
                                    <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                        {capabilityLabel(item.capability)} · {item.fields?.length || 0} 个参数
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                    <Button size="small" icon={<Pencil className="size-3.5" />} onClick={() => openEditEditor(item)}>
                                        编辑
                                    </Button>
                                    <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => removeWorkflow(item)}>
                                        删除
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <Modal
                title={editingId ? "编辑工作流" : "上传工作流"}
                open={editorOpen}
                okText={editingId ? "保存" : "上传"}
                cancelText="取消"
                confirmLoading={editorSaving}
                width={860}
                onOk={() => void saveEditor()}
                onCancel={() => setEditorOpen(false)}
            >
                <div className="max-h-[min(68dvh,640px)] space-y-4 overflow-y-auto pr-1">
                    <div className="grid gap-x-4 sm:grid-cols-2">
                        <div>
                            <div className="mb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">名称</div>
                            <Input value={editorName} disabled={Boolean(editingId)} onChange={(event) => setEditorName(event.target.value)} />
                        </div>
                        <div>
                            <div className="mb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">显示标题</div>
                            <Input value={editorTitle} onChange={(event) => setEditorTitle(event.target.value)} />
                        </div>
                    </div>
                    <div>
                        <div className="mb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">能力类型</div>
                        <Select
                            className="w-full"
                            value={editorCapability || undefined}
                            placeholder="自动识别"
                            allowClear
                            options={CAPABILITY_OPTIONS}
                            onChange={(value) => setEditorCapability((value || "") as ComfyUiCapability | "")}
                        />
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">留空则由画布端根据工作流内容自动识别。</p>
                    </div>
                    <div>
                        <div className="mb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">参数表单（{editorFields.length} 项，画布节点按此渲染）</div>
                        {editorFields.length === 0 ? (
                            <div className="rounded-md border border-dashed border-zinc-300 py-4 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                                暂无参数，从下方「可用输入」添加；不添加则画布端按原样执行。
                            </div>
                        ) : (
                            <div className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800/70 dark:border-zinc-800">
                                {editorFields.map((field, index) => (
                                    <div key={field.id} className="space-y-2 px-3 py-2.5">
                                        <div className="flex items-center gap-2">
                                            <Input className="max-w-44" size="small" value={field.name} placeholder="参数显示名" onChange={(event) => updateEditorField(index, { name: event.target.value })} />
                                            <Select className="w-28" size="small" value={field.type} options={FIELD_TYPE_OPTIONS} onChange={(type) => updateEditorField(index, { type })} />
                                            <span className="min-w-0 flex-1 truncate text-xs text-zinc-400 dark:text-zinc-500">
                                                节点 {field.node} · {field.input}
                                            </span>
                                            <Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />} aria-label="删除该参数" onClick={() => setEditorFields((current) => current.filter((_, i) => i !== index))} />
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {field.type === "number" || field.type === "slider" ? (
                                                <>
                                                    <InputNumber size="small" className="w-24" placeholder="最小" value={field.min ?? undefined} onChange={(min) => updateEditorField(index, { min })} />
                                                    <InputNumber size="small" className="w-24" placeholder="最大" value={field.max ?? undefined} onChange={(max) => updateEditorField(index, { max })} />
                                                    <InputNumber size="small" className="w-24" placeholder="步长" value={field.step ?? undefined} onChange={(step) => updateEditorField(index, { step })} />
                                                </>
                                            ) : field.type === "dropdown" ? (
                                                <Select
                                                    className="min-w-56 flex-1"
                                                    size="small"
                                                    mode="tags"
                                                    placeholder="选项，回车添加"
                                                    open={false}
                                                    suffixIcon={null}
                                                    value={field.options || []}
                                                    onChange={(options) => updateEditorField(index, { options })}
                                                />
                                            ) : field.type === "boolean" ? (
                                                <Switch size="small" checked={Boolean(field.default)} onChange={(checked) => updateEditorField(index, { default: checked })} />
                                            ) : field.type === "image" || field.type === "video" || field.type === "audio" ? (
                                                <span className="text-xs text-zinc-400 dark:text-zinc-500">媒体字段在画布端引用上游节点，无需默认值</span>
                                            ) : (
                                                <Input
                                                    size="small"
                                                    className="min-w-56 flex-1"
                                                    placeholder="默认值"
                                                    value={field.default === undefined || field.default === null ? "" : String(field.default)}
                                                    onChange={(event) => updateEditorField(index, { default: event.target.value === "" ? undefined : event.target.value })}
                                                />
                                            )}
                                            <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                                                <Switch size="small" checked={Boolean(field.bindPrompt)} onChange={(checked) => updateEditorField(index, { bindPrompt: checked })} />
                                                绑定提示词
                                            </label>
                                            {field.type === "number" || field.type === "slider" ? (
                                                <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                                                    <Switch size="small" checked={Boolean(field.randomEnabled)} onChange={(checked) => updateEditorField(index, { randomEnabled: checked })} />
                                                    每次随机
                                                </label>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {editorWorkflow ? (
                            <div className="mt-2">
                                <div className="mb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">可用输入（点击添加，已排除节点间连线）</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {listComfyWorkflowInputCandidates(editorWorkflow)
                                        .filter((candidate) => !editorFields.some((field) => fieldKey(field) === fieldKey(candidate.field)))
                                        .map((candidate) => (
                                            <Button key={fieldKey(candidate.field)} size="small" onClick={() => addEditorCandidate(fieldKey(candidate.field))}>
                                                {candidate.nodeTitle} · {candidate.input}
                                            </Button>
                                        ))}
                                </div>
                            </div>
                        ) : null}
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">数字/滑杆可限定最小、最大、步长；下拉选择可维护选项；绑定提示词的字段会被 Agent 任务自动填入提示词。</p>
                    </div>
                </div>
            </Modal>

            <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void openUploadEditor(file);
                    event.target.value = "";
                }}
            />
        </div>
    );
}
