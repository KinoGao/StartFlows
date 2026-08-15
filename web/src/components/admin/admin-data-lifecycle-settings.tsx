"use client";

import { InputNumber } from "antd";
import { DatabaseZap } from "lucide-react";

import { LabeledControl, SectionTitle, SettingToggle } from "@/components/admin/admin-settings-controls";
import type { AuthSettings } from "@/lib/auth/store";

type DataLifecycleKey = keyof AuthSettings["dataLifecycle"];

export function DataLifecyclePanel({ settings, onChange }: { settings: AuthSettings; onChange: (key: DataLifecycleKey, value: boolean | number) => void }) {
    const lifecycle = settings.dataLifecycle;
    return (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <SectionTitle icon={<DatabaseZap className="size-4" />} title="到期技术数据" />
            <div className="mt-4 grid gap-x-6 gap-y-4 lg:grid-cols-2">
                <SettingToggle
                    title="过期登录会话"
                    description="删除已经失效、不能再用于登录的会话记录。"
                    checked={lifecycle.cleanupExpiredSessions}
                    checkedChildren="清理"
                    unCheckedChildren="保留"
                    onChange={(value) => onChange("cleanupExpiredSessions", value)}
                />
                <SettingToggle
                    title="过期邮箱验证码"
                    description="删除已经过期或已经使用的验证码记录。"
                    checked={lifecycle.cleanupExpiredEmailCodes}
                    checkedChildren="清理"
                    unCheckedChildren="保留"
                    onChange={(value) => onChange("cleanupExpiredEmailCodes", value)}
                />
                <SettingToggle
                    title="到期生成任务"
                    description="删除超过任务自身技术保留期的终态记录。"
                    checked={lifecycle.cleanupExpiredGenerationTasks}
                    checkedChildren="清理"
                    unCheckedChildren="保留"
                    onChange={(value) => onChange("cleanupExpiredGenerationTasks", value)}
                />
                <SettingToggle
                    title="过期临时媒体"
                    description="仅删除没有业务引用的到期临时图片、视频和音频。"
                    checked={lifecycle.cleanupExpiredTemporaryMedia}
                    checkedChildren="清理"
                    unCheckedChildren="保留"
                    onChange={(value) => onChange("cleanupExpiredTemporaryMedia", value)}
                />
            </div>
            <div className="mt-4 max-w-xs border-t border-stone-200 pt-4 dark:border-stone-800">
                <LabeledControl label="单类每批处理数量">
                    <InputNumber className="w-full" min={1} max={500} precision={0} value={lifecycle.maintenanceBatchSize} onChange={(value) => onChange("maintenanceBatchSize", Number(value))} />
                </LabeledControl>
            </div>
        </div>
    );
}
