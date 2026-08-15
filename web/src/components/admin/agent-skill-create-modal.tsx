"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, InputNumber, Modal, Segmented, Select, Space, Switch } from "antd";
import { Download, GitBranch, PencilLine } from "lucide-react";
import { nanoid } from "nanoid";

import type { AgentSkill } from "@/lib/auth/store-types";
import { importAgentSkillFromGithub, type AgentSkillImportCandidate, type ImportedAgentSkill } from "@/services/api/admin-agent-skills";

type AgentSkillCreateModalProps = {
    open: boolean;
    existingSkills: AgentSkill[];
    onClose: () => void;
    onCreate: (skill: AgentSkill) => Promise<boolean>;
};

type SkillFormValues = {
    name: string;
    description: string;
    instructions: string;
    keywords: string;
    workspaces: AgentSkill["workspaces"];
    action: AgentSkill["action"];
    requiresReference: boolean;
    size: string;
    quality: string;
    count: number;
    videoSeconds: number;
};

const workspaceOptions = [
    { value: "image", label: "图片创作" },
    { value: "video", label: "视频创作" },
    { value: "canvas", label: "画布" },
    { value: "drama", label: "短剧项目" },
];

export function AgentSkillCreateModal({ open, existingSkills, onClose, onCreate }: AgentSkillCreateModalProps) {
    const [form] = Form.useForm<SkillFormValues>();
    const [mode, setMode] = useState<"manual" | "github">("github");
    const [sourceUrl, setSourceUrl] = useState("");
    const [candidates, setCandidates] = useState<AgentSkillImportCandidate[]>([]);
    const [selectedPath, setSelectedPath] = useState("");
    const [importedSkill, setImportedSkill] = useState<ImportedAgentSkill>();
    const [importError, setImportError] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        setMode("github");
        setSourceUrl("");
        setCandidates([]);
        setSelectedPath("");
        setImportedSkill(undefined);
        setImportError("");
        form.setFieldsValue({ name: "", description: "", instructions: "", keywords: "", workspaces: ["image"], action: "generate", requiresReference: false, size: "", quality: "", count: 1, videoSeconds: 5 });
    }, [form, open]);

    const extract = async () => {
        if (!sourceUrl.trim()) {
            setImportError("请输入公开 GitHub 地址");
            return;
        }
        setImportError("");
        setLoading(true);
        try {
            const result = await importAgentSkillFromGithub({ url: sourceUrl.trim(), path: selectedPath || undefined });
            setCandidates(result.candidates);
            if (result.candidates.length) {
                setSelectedPath(result.candidates[0].path);
                setImportedSkill(undefined);
                return;
            }
            if (result.skill) {
                setImportedSkill(result.skill);
                form.setFieldsValue(valuesFromSkill(result.skill));
            }
        } catch (error) {
            setImportError(error instanceof Error ? error.message : "提取 GitHub Skill 失败");
        } finally {
            setLoading(false);
        }
    };

    const submit = async (values: SkillFormValues) => {
        const idBase = importedSkill?.id || `skill-${nanoid(8)}`;
        const id = uniqueId(idBase, existingSkills);
        const defaultConfig: AgentSkill["defaultConfig"] = {};
        if (values.size.trim()) defaultConfig.size = values.size.trim();
        if (values.quality.trim()) defaultConfig[values.workspaces?.includes("video") ? "vquality" : "quality"] = values.quality.trim();
        if (values.workspaces?.includes("image")) defaultConfig.count = Math.max(1, Number(values.count) || 1);
        if (values.workspaces?.includes("video")) defaultConfig.videoSeconds = Math.max(1, Number(values.videoSeconds) || 5);
        setLoading(true);
        try {
            const saved = await onCreate({
                id,
                name: values.name.trim(),
                description: values.description.trim(),
                plannerSummary: importedSkill?.plannerSummary || values.description.trim(),
                instructions: values.instructions.trim(),
                enabled: importedSkill ? false : true,
                keywords: values.keywords
                    .split(/[、,，\n]/)
                    .map((item) => item.trim())
                    .filter(Boolean),
                workspaces: values.workspaces?.length ? values.workspaces : ["image"],
                action: values.action || "generate",
                requiresReference: Boolean(values.requiresReference),
                defaultConfig,
                sourceUrl: importedSkill?.sourceUrl,
                sourceRepository: importedSkill?.repository,
                sourcePath: importedSkill?.sourcePath,
                sourceVersion: importedSkill?.sourceVersion,
                sourceCommit: importedSkill?.sourceCommit,
                sourceContentHash: importedSkill?.sourceContentHash,
                license: importedSkill?.license,
            });
            if (saved) form.resetFields();
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title="新增 Agent Skill"
            open={open}
            centered
            width={760}
            destroyOnHidden
            okText="添加并保存"
            cancelText="取消"
            confirmLoading={loading}
            keyboard={!loading}
            onCancel={onClose}
            onOk={() => form.submit()}
            mask={{ closable: !loading }}
            styles={{ body: { maxHeight: "min(72dvh, 720px)", overflowY: "auto", paddingTop: 8 } }}
        >
            <div className="space-y-4">
                <Segmented
                    block
                    aria-label="Skill 创建方式"
                    value={mode}
                    options={[
                        {
                            value: "github",
                            label: (
                                <span className="inline-flex items-center justify-center gap-2">
                                    <GitBranch className="size-4" aria-hidden />从 GitHub 提取
                                </span>
                            ),
                        },
                        {
                            value: "manual",
                            label: (
                                <span className="inline-flex items-center justify-center gap-2">
                                    <PencilLine className="size-4" aria-hidden />
                                    手动创建
                                </span>
                            ),
                        },
                    ]}
                    onChange={(value) => setMode(value as "manual" | "github")}
                />

                {mode === "github" ? (
                    <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/70 dark:bg-blue-950/20">
                        <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">公开 Skill 地址</div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Input
                                name="sourceUrl"
                                value={sourceUrl}
                                prefix={<GitBranch className="size-4 text-stone-400" />}
                                placeholder="https://github.com/owner/repo 或 .../SKILL.md"
                                onChange={(event) => {
                                    setSourceUrl(event.target.value);
                                    setImportError("");
                                    setCandidates([]);
                                    setSelectedPath("");
                                    setImportedSkill(undefined);
                                }}
                            />
                            <Button type="primary" icon={<Download className="size-4" />} loading={loading} onClick={() => void extract()}>
                                提取
                            </Button>
                        </div>
                        {importError ? <Alert type="error" showIcon message={importError} /> : null}
                        {candidates.length ? (
                            <div className="space-y-2">
                                <div className="text-xs text-stone-600 dark:text-stone-300">发现 {candidates.length} 个 SKILL.md，请选择一个后读取。</div>
                                <Select className="w-full" value={selectedPath} options={candidates.map((item) => ({ value: item.path, label: `${item.name} · ${item.path}` }))} onChange={setSelectedPath} />
                                <Button icon={<Download className="size-4" />} loading={loading} onClick={() => void extract()}>
                                    读取选中的 Skill
                                </Button>
                            </div>
                        ) : null}
                        {importedSkill ? (
                            <Alert
                                type="success"
                                showIcon
                                message={<span>AI 提取完成：{importedSkill.name}</span>}
                                description={
                                    <span className="break-all">
                                        {importedSkill.sourcePath}
                                        {importedSkill.license ? ` · ${importedSkill.license}` : ""} · 导入后默认停用
                                    </span>
                                }
                            />
                        ) : (
                            <div className="text-xs leading-5 text-stone-600 dark:text-stone-400">读取公开仓库中的 SKILL.md 后，由后台默认文本模型整理为中文原生规则；不会执行仓库代码，整理后仍可编辑确认。</div>
                        )}
                    </div>
                ) : null}

                <Form form={form} layout="vertical" requiredMark={false} onFinish={submit}>
                    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        <Form.Item label="Skill 名称" name="name" rules={[{ required: true, message: "请输入 Skill 名称" }]}>
                            <Input placeholder="例如：电商海报策划" />
                        </Form.Item>
                        <Form.Item label="触发关键词" name="keywords">
                            <Input placeholder="用逗号分隔，例如：海报, 电商" />
                        </Form.Item>
                    </div>
                    <Form.Item label="用途说明" name="description">
                        <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={240} placeholder="说明这个 Skill 适合处理什么任务" />
                    </Form.Item>
                    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        <Form.Item label="适用工作区" name="workspaces" rules={[{ required: true, message: "请选择工作区" }]}>
                            <Select mode="multiple" options={workspaceOptions} placeholder="选择工作区" />
                        </Form.Item>
                        <Form.Item label="执行方式" name="action">
                            <Select
                                options={[
                                    { value: "generate", label: "生成" },
                                    { value: "edit", label: "编辑" },
                                ]}
                            />
                        </Form.Item>
                    </div>
                    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        <Form.Item label="默认比例" name="size">
                            <Input placeholder="例如 1:1 或 16:9" />
                        </Form.Item>
                        <Form.Item label="默认质量" name="quality">
                            <Input placeholder="例如 high / 1080" />
                        </Form.Item>
                    </div>
                    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        <Form.Item label="默认图片数量" name="count">
                            <InputNumber className="w-full" min={1} max={10} />
                        </Form.Item>
                        <Form.Item label="默认视频时长（秒）" name="videoSeconds">
                            <InputNumber className="w-full" min={1} max={60} />
                        </Form.Item>
                    </div>
                    <Form.Item label="执行规则" name="instructions" rules={[{ required: true, message: "请输入执行规则" }]}>
                        <Input.TextArea autoSize={{ minRows: 8, maxRows: 18 }} maxLength={8000} placeholder="写明 Agent 应如何规划与执行任务" />
                    </Form.Item>
                    <Form.Item name="requiresReference" valuePropName="checked" className="mb-0">
                        <Space>
                            <Switch size="small" />
                            <span className="text-sm text-stone-700 dark:text-stone-300">必须使用参考素材</span>
                        </Space>
                    </Form.Item>
                </Form>
                {importedSkill?.sourceUrl ? (
                    <a href={importedSkill.sourceUrl} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 break-all text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                        <GitBranch className="size-3.5 shrink-0" />
                        {importedSkill.sourceUrl}
                    </a>
                ) : null}
            </div>
        </Modal>
    );
}

function valuesFromSkill(skill: ImportedAgentSkill): SkillFormValues {
    return {
        name: skill.name,
        description: skill.description,
        instructions: skill.instructions,
        keywords: skill.keywords.join("、"),
        workspaces: skill.workspaces || ["image"],
        action: skill.action || "generate",
        requiresReference: Boolean(skill.requiresReference),
        size: String(skill.defaultConfig?.size || ""),
        quality: String(skill.defaultConfig?.quality || skill.defaultConfig?.vquality || ""),
        count: Number(skill.defaultConfig?.count || 1),
        videoSeconds: Number(skill.defaultConfig?.videoSeconds || 5),
    };
}

function uniqueId(base: string, skills: AgentSkill[]) {
    const ids = new Set(skills.map((skill) => skill.id));
    if (!ids.has(base)) return base;
    let index = 2;
    while (ids.has(`${base}-${index}`)) index += 1;
    return `${base}-${index}`;
}
