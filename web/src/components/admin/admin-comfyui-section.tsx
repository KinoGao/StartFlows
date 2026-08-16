"use client";

import { useEffect, useState } from "react";
import { App, Button, Form, Input, InputNumber, Switch } from "antd";
import { PlugZap, RefreshCw } from "lucide-react";

type ComfyUiConfig = {
    enabled: boolean;
    baseUrl: string;
    clientId: string;
    defaultWorkflowId: string;
    timeoutSeconds: number;
    pollIntervalMs: number;
};

export function AdminComfyUiSection() {
    const { message } = App.useApp();
    const [form] = Form.useForm<ComfyUiConfig>();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [workflowCount, setWorkflowCount] = useState<number | null>(null);

    useEffect(() => {
        void (async () => {
            try {
                const [configResponse, workflowsResponse] = await Promise.all([fetch("/api/comfyui-config"), fetch("/api/workflows")]);
                const configBody = (await configResponse.json()) as { comfyui?: ComfyUiConfig; error?: string };
                if (!configResponse.ok || !configBody.comfyui) throw new Error(configBody.error || "ComfyUI 配置加载失败");
                form.setFieldsValue(configBody.comfyui);
                const workflowsBody = (await workflowsResponse.json()) as { data?: unknown[] };
                setWorkflowCount(Array.isArray(workflowsBody.data) ? workflowsBody.data.length : null);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "ComfyUI 配置加载失败");
            } finally {
                setLoading(false);
            }
        })();
    }, [form, message]);

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
            const stats = (await response.json()) as { system?: { comfyui_version?: string; os?: string } };
            message.success(`连接成功${stats.system?.comfyui_version ? `：ComfyUI ${stats.system.comfyui_version}` : ""}`);
        } catch (error) {
            message.error(`连接失败：${error instanceof Error ? error.message : "未知错误"}`);
        } finally {
            setTesting(false);
        }
    };

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
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">工作流库</h2>
                        <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                            {workflowCount === null ? "正在读取工作流列表…" : `当前共 ${workflowCount} 套已发布工作流，画布 ComfyUI 节点可直接选用。`}
                        </p>
                    </div>
                    <Button
                        icon={<RefreshCw className="size-4" />}
                        onClick={() =>
                            void fetch("/api/workflows")
                                .then(async (response) => {
                                    const body = (await response.json()) as { data?: unknown[] };
                                    setWorkflowCount(Array.isArray(body.data) ? body.data.length : null);
                                })
                                .catch(() => message.error("工作流列表读取失败"))
                        }
                    >
                        刷新
                    </Button>
                </div>
            </div>
        </div>
    );
}
