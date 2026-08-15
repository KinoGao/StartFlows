"use client";

import { useState } from "react";
import { App, Button, Input, Modal, QRCode, Tag, Tooltip } from "antd";
import { Copy, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";

import { useCopyText } from "@/hooks/use-copy-text";
import { beginAdminMfaSetup, disableAdminMfa, enableAdminMfa, type AdminMfaSetup } from "@/services/api/admin-mfa";
import { useUserStore } from "@/stores/use-user-store";

import { profileDangerButtonClass, profilePrimaryButtonClass, profileSecondaryButtonClass } from "./profile-elements";

type Dialog = "setup" | "disable" | null;

export function AdminMfaPanel() {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const user = useUserStore((state) => state.user);
    const setUser = useUserStore((state) => state.setUser);
    const [dialog, setDialog] = useState<Dialog>(null);
    const [currentPassword, setCurrentPassword] = useState("");
    const [token, setToken] = useState("");
    const [setup, setSetup] = useState<AdminMfaSetup | null>(null);
    const [submitting, setSubmitting] = useState(false);

    if (user?.role !== "admin") return null;

    const closeDialog = () => {
        if (submitting) return;
        setDialog(null);
        setCurrentPassword("");
        setToken("");
        setSetup(null);
    };

    const createSetup = async () => {
        setSubmitting(true);
        try {
            setSetup(await beginAdminMfaSetup(currentPassword));
            setCurrentPassword("");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "创建 MFA 设置失败");
        } finally {
            setSubmitting(false);
        }
    };

    const confirmSetup = async () => {
        setSubmitting(true);
        try {
            setUser(await enableAdminMfa(token));
            message.success("管理员 MFA 已启用");
            closeAfterSuccess();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "启用管理员 MFA 失败");
        } finally {
            setSubmitting(false);
        }
    };

    const confirmDisable = async () => {
        setSubmitting(true);
        try {
            setUser(await disableAdminMfa(currentPassword, token));
            message.success("管理员 MFA 已关闭");
            closeAfterSuccess();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "关闭管理员 MFA 失败");
        } finally {
            setSubmitting(false);
        }
    };

    const closeAfterSuccess = () => {
        setDialog(null);
        setCurrentPassword("");
        setToken("");
        setSetup(null);
    };

    return (
        <div className="max-w-xl space-y-4 border-t border-stone-200 pt-5 dark:border-stone-800">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-stone-950 dark:text-white">管理员 MFA</h3>
                        <Tag color={user.mfaEnabled ? "green" : "default"}>{user.mfaEnabled ? "已启用" : "未启用"}</Tag>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-stone-500 dark:text-stone-400">登录管理员账号时验证身份验证器动态码。</p>
                </div>
                {user.mfaEnabled ? (
                    <Button danger className={`${profileDangerButtonClass} shrink-0`} icon={<ShieldOff className="size-4" />} onClick={() => setDialog("disable")}>
                        关闭 MFA
                    </Button>
                ) : (
                    <Button type="primary" className={`${profilePrimaryButtonClass} shrink-0`} icon={<ShieldCheck className="size-4" />} onClick={() => setDialog("setup")}>
                        设置 MFA
                    </Button>
                )}
            </div>

            <Modal
                title={dialog === "disable" ? "关闭管理员 MFA" : "设置管理员 MFA"}
                open={dialog !== null}
                onCancel={closeDialog}
                mask={{ closable: false }}
                closable={{ "aria-label": "关闭" }}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button className={profileSecondaryButtonClass} disabled={submitting} onClick={closeDialog}>
                            取消
                        </Button>
                        {dialog === "setup" && !setup ? (
                            <Button type="primary" className={profilePrimaryButtonClass} loading={submitting} icon={<KeyRound className="size-4" />} onClick={() => void createSetup()}>
                                生成设置
                            </Button>
                        ) : dialog === "setup" ? (
                            <Button type="primary" className={profilePrimaryButtonClass} loading={submitting} icon={<ShieldCheck className="size-4" />} onClick={() => void confirmSetup()}>
                                验证并启用
                            </Button>
                        ) : (
                            <Button danger className={profileDangerButtonClass} loading={submitting} icon={<ShieldOff className="size-4" />} onClick={() => void confirmDisable()}>
                                验证并关闭
                            </Button>
                        )}
                    </div>
                }
            >
                {dialog === "setup" ? (
                    setup ? (
                        <div className="space-y-5">
                            <div className="flex justify-center" aria-label="管理员 MFA 设置二维码">
                                <QRCode value={setup.uri} type="svg" />
                            </div>
                            <div className="space-y-2">
                                <span className="text-sm font-medium text-stone-700 dark:text-stone-200">手动设置密钥</span>
                                <div className="flex min-w-0 items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-700 dark:bg-stone-900">
                                    <code className="min-w-0 flex-1 break-all text-sm text-stone-800 dark:text-stone-100">{setup.secret}</code>
                                    <Tooltip title="复制密钥">
                                        <Button type="text" aria-label="复制 MFA 密钥" icon={<Copy className="size-4" />} onClick={() => copyText(setup.secret, "MFA 密钥已复制")} />
                                    </Tooltip>
                                </div>
                            </div>
                            <TokenInput value={token} onChange={setToken} autoFocus />
                        </div>
                    ) : (
                        <PasswordInput value={currentPassword} onChange={setCurrentPassword} />
                    )
                ) : (
                    <div className="space-y-4">
                        <PasswordInput value={currentPassword} onChange={setCurrentPassword} />
                        <TokenInput value={token} onChange={setToken} />
                    </div>
                )}
            </Modal>
        </div>
    );
}

function PasswordInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return (
        <label className="block space-y-2">
            <span className="text-sm font-medium text-stone-700 dark:text-stone-200">当前密码</span>
            <Input.Password value={value} autoComplete="current-password" onChange={(event) => onChange(event.target.value)} />
        </label>
    );
}

function TokenInput({ value, onChange, autoFocus = false }: { value: string; onChange: (value: string) => void; autoFocus?: boolean }) {
    return (
        <label className="block space-y-2">
            <span className="text-sm font-medium text-stone-700 dark:text-stone-200">动态验证码</span>
            <Input value={value} autoFocus={autoFocus} autoComplete="one-time-code" inputMode="numeric" placeholder="输入身份验证器动态码" onChange={(event) => onChange(event.target.value)} />
        </label>
    );
}
