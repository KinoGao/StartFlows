"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Checkbox, Form, Input, InputNumber, Modal, Select, Switch } from "antd";
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

type FieldDraft = ComfyWorkflowField & { included: boolean };

const CAPABILITY_OPTIONS = Object.entries(COMFY_CAPABILITY_META).map(([value, meta]) => ({ value, label: meta.label }));

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
            const fields: FieldDraft[] = listComfyWorkflowInputCandidates(workflow).map((candidate) => ({ ...candidate.field, included: true }));
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
        setEditorWorkflow(null);
        setEditorName(item.name);
        setEditorTitle(item.title);
        setEditorCapability((item.capability || inferComfyWorkflowCapability(item.workflow, inferredFields) || "") as ComfyUiCapability | "");
        setEditorFields(inferredFields.map((field) => ({ ...field, included: true })));
        setEditorOpen(true);
    };

    const saveEditor = async () => {
        const title = editorTitle.trim() || editorName.trim() || "未命名工作流";
        const fields = editorFields.filter((field) => field.included).map(({ included: _included, ...field }) => field);
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
                width={760}
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
                        <div className="mb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">参数表单（{editorFields.filter((field) => field.included).length} / {editorFields.length} 项启用）</div>
                        {editorFields.length === 0 ? (
                            <div className="rounded-md border border-dashed border-zinc-300 py-4 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                                这套工作流没有可填参数，画布端将直接按原样执行。
                            </div>
                        ) : (
                            <div className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800/70 dark:border-zinc-800">
                                {editorFields.map((field, index) => (
                                    <div key={field.id} className="flex items-center gap-3 px-3 py-2">
                                        <Checkbox
                                            checked={field.included}
                                            onChange={(event) => setEditorFields((current) => current.map((item, i) => (i === index ? { ...item, included: event.target.checked } : item)))}
                                        />
                                        <Input
                                            className="max-w-40"
                                            size="small"
                                            value={field.name}
                                            disabled={!field.included}
                                            onChange={(event) => setEditorFields((current) => current.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))}
                                        />
                                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{field.type}</span>
                                        <span className="min-w-0 flex-1 truncate text-xs text-zinc-400 dark:text-zinc-500">
                                            节点 {field.node} · {field.input}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">勾选决定画布节点表单里出现哪些参数，左侧可改参数显示名。</p>
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
