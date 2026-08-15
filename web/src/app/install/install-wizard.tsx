"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Database, RefreshCw, ServerCrash, ShieldCheck, Sparkles } from "lucide-react";

import { AuthForm } from "@/components/auth/auth-form";
import { SiteLogo } from "@/components/layout/site-logo";
import type { InstallStatus } from "@/lib/server/install-status";
import { usePublicSessionStore } from "@/stores/use-public-session-store";
import type { SiteSettings } from "@/lib/auth/store";
import { DatabaseConfigBuilder } from "./database-config-builder";

type InstallStepId = "intro" | "database" | "admin";

const primaryButtonClass =
    "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold !text-white shadow-sm shadow-slate-950/15 transition enabled:hover:bg-black disabled:cursor-not-allowed disabled:bg-slate-300 disabled:!text-white disabled:shadow-none [&_svg]:!text-white";
const secondaryButtonClass = "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-white";
const ghostButtonClass = "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900";

const steps = [
    { id: "intro" as const, title: "安装说明", description: "确认部署方式和准备事项" },
    { id: "database" as const, title: "配置数据库", description: "生成配置并初始化 PostgreSQL" },
    { id: "admin" as const, title: "创建管理员", description: "创建第一个后台账号" },
];

export function InstallWizard({ install, initialSite }: { install: InstallStatus; initialSite: Pick<SiteSettings, "title" | "logoUrl"> }) {
    const [activeStep, setActiveStep] = useState<InstallStepId>("intro");
    const [currentInstall, setCurrentInstall] = useState(install);
    const [installToken, setInstallToken] = useState("");
    const sessionSite = usePublicSessionStore((state) => state.payload?.settings?.site);
    const site = sessionSite || initialSite;
    const databaseReady = currentInstall.database.healthy && currentInstall.database.schemaReady;
    const schemaPending = currentInstall.database.healthy && !currentInstall.database.schemaReady;
    const runtimeReady = databaseReady && currentInstall.security.encryptionReady && currentInstall.security.installTokenReady;
    const status = useMemo(() => installStatusView(currentInstall), [currentInstall]);

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    }, [activeStep]);

    const goStep = (step: InstallStepId) => {
        if (step === "admin" && !runtimeReady) return;
        setActiveStep(step);
    };

    return (
        <div className="mx-auto w-full max-w-6xl">
            <header className="flex flex-col gap-4 px-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                <Link href="/" className="inline-flex min-w-0 items-center gap-3">
                    <SiteLogo logoUrl={site.logoUrl} className="size-11" />
                    <span className="min-w-0">
                        <span className="block text-2xl font-semibold tracking-normal text-slate-950">{site.title} 安装向导</span>
                        <span className="mt-1 block text-sm text-slate-500">三步完成服务器初始化</span>
                    </span>
                </Link>
                <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium shadow-sm backdrop-blur ${status.className}`}>
                    {status.icon}
                    {status.label}
                </span>
            </header>

            <section className="mt-4 grid overflow-hidden rounded-lg border border-white/70 bg-white/60 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-2xl lg:grid-cols-[300px_minmax(0,1fr)]">
                <aside className="border-b border-slate-200/70 bg-white/55 p-4 lg:border-b-0 lg:border-r">
                    <div className="rounded-lg bg-slate-100/80 p-1">
                        {steps.map((step, index) => {
                            const active = activeStep === step.id;
                            const locked = step.id === "admin" && !runtimeReady;
                            const done = step.id === "intro" || (step.id === "database" && runtimeReady) || (step.id === "admin" && currentInstall.ready);
                            return (
                                <button
                                    key={step.id}
                                    type="button"
                                    onClick={() => goStep(step.id)}
                                    disabled={locked}
                                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition ${active ? "bg-white text-slate-950 shadow-sm" : locked ? "cursor-not-allowed text-slate-300" : "text-slate-500 hover:bg-white/70 hover:text-slate-900"}`}
                                >
                                    <span
                                        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${active ? "bg-slate-950 text-white" : done ? "bg-emerald-100 text-emerald-700" : locked ? "bg-white/70 text-slate-300" : "bg-white text-slate-400"}`}
                                    >
                                        {done && !active ? <CheckCircle2 className="size-4" /> : <span className="text-xs font-semibold">{index + 1}</span>}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-sm font-semibold">{step.title}</span>
                                        <span className="mt-0.5 block truncate text-xs opacity-70">{locked ? "先完成数据库和加密配置" : step.description}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="mt-4 rounded-lg border border-slate-200/80 bg-white/70 p-4">
                        <div className="grid grid-cols-3 gap-3">
                            <StatusMetric label="数据库" value={databaseReady ? "已初始化" : schemaPending ? "待初始化" : currentInstall.database.configured ? "连接失败" : "未配置"} />
                            <StatusMetric label="安装令牌" value={currentInstall.security.installTokenReady ? "已就绪" : "未配置"} />
                            <StatusMetric label="用户" value={currentInstall.userCount ? `${currentInstall.userCount} 个` : "未创建"} />
                        </div>
                        <p className="mt-3 text-xs leading-5 text-slate-500">{currentInstall.database.message}</p>
                    </div>
                </aside>

                <div className="min-w-0 bg-white/50">
                    {activeStep === "intro" ? <IntroStep siteTitle={site.title} onNext={() => setActiveStep("database")} /> : null}
                    {activeStep === "database" ? (
                        <DatabaseStep
                            install={currentInstall}
                            installToken={installToken}
                            onInstallTokenChange={setInstallToken}
                            runtimeReady={runtimeReady}
                            onInstallChange={setCurrentInstall}
                            onPrev={() => setActiveStep("intro")}
                            onNext={() => setActiveStep("admin")}
                        />
                    ) : null}
                    {activeStep === "admin" ? <AdminStep install={currentInstall} installToken={installToken} onInstallTokenChange={setInstallToken} runtimeReady={runtimeReady} onPrev={() => setActiveStep("database")} /> : null}
                </div>
            </section>
        </div>
    );
}

function IntroStep({ siteTitle, onNext }: { siteTitle: string; onNext: () => void }) {
    return (
        <section className="p-5 sm:p-8">
            <StepHeader step="步骤 1 / 3" title="先确认安装流程" description={`${siteTitle} 面向服务器部署，商业数据会进入 PostgreSQL。安装向导会引导你生成配置、检查初始化状态，并创建第一个管理员账号。`} />

            <div className="mt-7 overflow-hidden rounded-lg border border-slate-200/80 bg-white/75 shadow-sm">
                <ProcessRow index="01" title="准备 PostgreSQL" text="本机使用 localhost；Docker 内置数据库使用 postgres；宝塔宿主机数据库使用 127.0.0.1；云数据库使用服务商连接地址。" />
                <ProcessRow index="02" title="写入部署配置" text="安装页不会保存数据库密码。复制的环境变量包含彼此隔离的维护令牌与 Worker 令牌，Compose 模板同时包含 App 和生成 Worker。" />
                <ProcessRow index="03" title="让配置生效并初始化" text="根据所选部署方式执行页面给出的重启命令，等待服务恢复后刷新检查；连接成功后手动初始化表结构，再创建管理员。" last />
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-xl text-sm leading-6 text-slate-500">如果你已经完成数据库配置，本页会直接显示当前初始化状态。</p>
                <button type="button" onClick={onNext} className={primaryButtonClass}>
                    下一步：配置数据库
                    <ArrowRight className="size-4" />
                </button>
            </div>
        </section>
    );
}

function DatabaseStep({
    install,
    installToken,
    onInstallTokenChange,
    runtimeReady,
    onInstallChange,
    onPrev,
    onNext,
}: {
    install: InstallStatus;
    installToken: string;
    onInstallTokenChange: (value: string) => void;
    runtimeReady: boolean;
    onInstallChange: (install: InstallStatus) => void;
    onPrev: () => void;
    onNext: () => void;
}) {
    const [initializing, setInitializing] = useState(false);
    const [initializeError, setInitializeError] = useState("");
    const canInitialize = install.database.configured && install.database.healthy && !install.database.schemaReady && install.security.encryptionReady && install.security.installTokenReady && installToken.trim().length >= 32;
    const schemaPending = install.database.healthy && !install.database.schemaReady;

    const initializeDatabase = async () => {
        setInitializing(true);
        setInitializeError("");
        try {
            const response = await fetch("/api/install/initialize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ installToken: installToken.trim() }) });
            const payload = (await response.json().catch(() => ({}))) as { data?: { install?: InstallStatus }; msg?: string };
            if (!response.ok || !payload.data?.install) throw new Error(payload.msg || "数据库初始化失败");
            onInstallChange(payload.data.install);
        } catch (error) {
            setInitializeError(error instanceof Error ? error.message : "数据库初始化失败");
        } finally {
            setInitializing(false);
        }
    };

    return (
        <section className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 p-5 sm:p-8">
                <StepHeader step="步骤 2 / 3" title="配置并初始化数据库" description="填写数据库信息后复制配置，写入服务器环境变量并重启 Web 服务。状态检查只验证连接；确认无误后由你显式初始化表结构。" />
                <div className="mt-6">
                    <DatabaseConfigBuilder />
                </div>
            </div>

            <aside className="border-t border-slate-200/70 bg-slate-50/70 p-5 xl:border-l xl:border-t-0">
                <div className={`rounded-lg border p-4 shadow-sm ${runtimeReady ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        {runtimeReady ? <CheckCircle2 className="size-4" /> : <Database className="size-4" />}
                        {runtimeReady ? "运行环境已就绪" : schemaPending ? "数据库连接成功，等待初始化" : "等待数据库与密钥就绪"}
                    </div>
                    <p className="mt-2 text-xs leading-5">{install.database.message}</p>
                    {install.database.detail ? <p className="mt-2 break-words text-xs leading-5 opacity-80">{install.database.detail}</p> : null}
                </div>

                <div className={`mt-3 rounded-lg border p-4 text-sm ${install.security.encryptionReady ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
                    <div className="flex items-center gap-2 font-semibold">
                        <ShieldCheck className="size-4" />
                        敏感配置加密
                    </div>
                    <p className="mt-2 text-xs leading-5">{install.security.message}</p>
                </div>

                <div className={`mt-3 rounded-lg border p-4 text-sm ${install.security.installTokenReady ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
                    <div className="flex items-center gap-2 font-semibold">
                        <ShieldCheck className="size-4" />
                        一次性安装令牌
                    </div>
                    <p className="mt-2 text-xs leading-5">{install.security.installTokenMessage}</p>
                    <input
                        className="mt-3 h-10 w-full rounded-lg border border-current/20 bg-white px-3 font-mono text-xs text-slate-950 outline-none placeholder:text-slate-400"
                        type="password"
                        value={installToken}
                        onChange={(event) => onInstallTokenChange(event.target.value)}
                        placeholder="从服务器 .env 粘贴安装令牌"
                        autoComplete="off"
                        aria-label="提交一次性安装令牌"
                    />
                </div>

                <div className="mt-5 border-l-2 border-slate-300 pl-4">
                    <div className="text-sm font-semibold text-slate-900">配置生效后的操作</div>
                    <ol className="mt-2 space-y-2 text-xs leading-5 text-slate-500">
                        <li>1. 按左侧当前部署方式的命令重新启动应用。</li>
                        <li>2. 等待 10-30 秒，再点击下方“刷新检查”。</li>
                        <li>3. 看到“数据库连接成功”后点击“初始化表结构”。</li>
                        <li>4. 初始化成功后再进入下一步创建管理员。</li>
                    </ol>
                </div>

                <div className="mt-5 grid gap-2">
                    <Link href="/install" className={secondaryButtonClass}>
                        <RefreshCw className="size-4" />
                        刷新检查
                    </Link>
                    {!install.database.schemaReady ? (
                        <button type="button" onClick={() => void initializeDatabase()} disabled={!canInitialize || initializing} className={primaryButtonClass}>
                            <Database className={`size-4 ${initializing ? "animate-pulse" : ""}`} />
                            {initializing ? "正在初始化" : "初始化表结构"}
                        </button>
                    ) : null}
                    {initializeError ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{initializeError}</p> : null}
                    <button type="button" onClick={onNext} disabled={!runtimeReady} className={primaryButtonClass}>
                        下一步：创建管理员
                        <ArrowRight className="size-4" />
                    </button>
                    <button type="button" onClick={onPrev} className={ghostButtonClass}>
                        <ArrowLeft className="size-4" />
                        返回安装说明
                    </button>
                </div>
            </aside>
        </section>
    );
}

function AdminStep({ install, installToken, onInstallTokenChange, runtimeReady, onPrev }: { install: InstallStatus; installToken: string; onInstallTokenChange: (value: string) => void; runtimeReady: boolean; onPrev: () => void }) {
    if (!runtimeReady) {
        return (
            <section className="p-5 sm:p-8">
                <StepHeader step="步骤 3 / 3" title="先完成运行环境配置" description="数据库表结构或敏感配置加密密钥尚未就绪，暂时不能创建管理员账号。" />
                <button type="button" onClick={onPrev} className={`mt-6 ${secondaryButtonClass}`}>
                    <ArrowLeft className="size-4" />
                    返回配置数据库
                </button>
            </section>
        );
    }

    if (install.ready) {
        return (
            <section className="p-5 sm:p-8">
                <StepHeader step="步骤 3 / 3" title="管理员账号已创建" description="站点已经完成初始化，可以进入后台继续配置模型渠道、套餐权益和支付渠道。" />
                <Link href="/login?next=/admin" className={`mt-6 ${primaryButtonClass}`}>
                    登录后台
                    <ArrowRight className="size-4" />
                </Link>
            </section>
        );
    }

    return (
        <section className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 bg-white/40">
                <AuthForm
                    mode="register"
                    nextPath="/admin"
                    registrationEnabled
                    emailRegistrationEnabled={false}
                    firstUser
                    installToken={installToken}
                    onInstallTokenChange={onInstallTokenChange}
                    variant="embedded"
                    className="!border-0 !bg-transparent !shadow-none"
                />
            </div>
            <aside className="border-t border-slate-200/70 bg-slate-50/70 p-5 xl:border-l xl:border-t-0">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        <ShieldCheck className="size-4" />
                        首个管理员需要安装令牌
                    </div>
                    <p className="mt-2 text-xs leading-5">只有安装向导可创建首个管理员。后续公开注册始终创建普通用户，并按后台注册策略控制。</p>
                </div>
                <button type="button" onClick={onPrev} className={`mt-5 ${ghostButtonClass}`}>
                    <ArrowLeft className="size-4" />
                    返回配置数据库
                </button>
            </aside>
        </section>
    );
}

function StepHeader({ step, title, description }: { step: string; title: string; description: string }) {
    return (
        <div>
            <p className="text-sm font-medium text-slate-700">{step}</p>
            <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">{title}</h1>
            <p className="mt-4 max-w-4xl text-base leading-8 text-slate-600">{description}</p>
        </div>
    );
}

function ProcessRow({ index, title, text, last }: { index: string; title: string; text: string; last?: boolean }) {
    return (
        <div className={`grid gap-3 px-5 py-4 sm:grid-cols-[56px_minmax(0,1fr)] ${last ? "" : "border-b border-slate-200/80"}`}>
            <div className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">{index}</div>
            <div>
                <div className="text-base font-semibold text-slate-950">{title}</div>
                <p className="mt-1 text-sm leading-6 text-slate-500">{text}</p>
            </div>
        </div>
    );
}

function StatusMetric({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-xs text-slate-400">{label}</div>
            <div className="mt-1 text-base font-semibold text-slate-950">{value}</div>
        </div>
    );
}

function installStatusView(install: InstallStatus) {
    if (install.ready) {
        return {
            label: "安装完成",
            icon: <CheckCircle2 className="size-4" />,
            className: "border-emerald-200 bg-emerald-50/80 text-emerald-700",
        };
    }
    if (install.firstAdminRequired) {
        return {
            label: "等待创建管理员",
            icon: <Sparkles className="size-4" />,
            className: "border-slate-200 bg-slate-50/80 text-slate-700",
        };
    }
    if (install.database.configured) {
        if (install.database.healthy && !install.database.schemaReady) {
            return {
                label: "等待初始化",
                icon: <Database className="size-4" />,
                className: "border-amber-200 bg-amber-50/80 text-amber-700",
            };
        }
        return {
            label: "数据库需检查",
            icon: <ServerCrash className="size-4" />,
            className: "border-rose-200 bg-rose-50/80 text-rose-700",
        };
    }
    return {
        label: "等待配置数据库",
        icon: <Circle className="size-4" />,
        className: "border-amber-200 bg-amber-50/80 text-amber-700",
    };
}
