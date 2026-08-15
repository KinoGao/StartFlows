"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import copy from "copy-to-clipboard";
import { Check, Copy, Database, FileCode2, KeyRound, RefreshCw, Server, TerminalSquare, type LucideIcon } from "lucide-react";

import { buildDeploymentSnippets, generateDeploymentSecret, modeOptions, type DeployMode } from "./database-config";

export function DatabaseConfigBuilder() {
    const [mode, setMode] = useState<DeployMode>("local");
    const [host, setHost] = useState("localhost");
    const [port, setPort] = useState("5432");
    const [database, setDatabase] = useState("vozeb_pro");
    const [username, setUsername] = useState("vozeb_pro");
    const [password, setPassword] = useState("");
    const [ssl, setSsl] = useState(false);
    const [encryptionKey, setEncryptionKey] = useState("");
    const [installToken, setInstallToken] = useState("");
    const [maintenanceToken, setMaintenanceToken] = useState("");
    const [workerToken, setWorkerToken] = useState("");
    const [copiedKey, setCopiedKey] = useState("");
    const [activeSnippet, setActiveSnippet] = useState<SnippetKey>("env");
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const configurationReady = Boolean(password && encryptionKey && installToken && maintenanceToken && workerToken);
    const snippets = useMemo(
        () =>
            buildDeploymentSnippets({
                mode,
                host: host.trim() || "localhost",
                port: port.trim() || "5432",
                database: database.trim() || "vozeb_pro",
                username: username.trim() || "vozeb_pro",
                password,
                ssl,
                encryptionKey,
                installToken,
                maintenanceToken,
                workerToken,
            }),
        [database, encryptionKey, host, installToken, maintenanceToken, mode, password, port, ssl, username, workerToken],
    );
    const snippetOptions: SnippetOption[] = [
        { key: "env", label: "环境变量", title: mode === "local" ? "web/.env.local" : "项目根目录 .env", description: "数据库、加密密钥与分离的维护/Worker 令牌", icon: FileCode2, text: snippets.envText },
        { key: "compose", label: "Compose", title: mode === "baota" ? "宝塔 Compose 模板" : "Docker Compose 模板", description: "同时启动 App 与生成 Worker", icon: Server, text: snippets.composeText },
        { key: "sql", label: "建库命令", title: "PostgreSQL 建库命令", description: "在数据库服务器终端中创建独立账号和数据库", icon: TerminalSquare, text: snippets.sqlText },
    ];
    const selectedSnippet = snippetOptions.find((item) => item.key === activeSnippet) || snippetOptions[0];
    const selectedMode = modeOptions.find((item) => item.value === mode) || modeOptions[0];
    const deploymentSteps = buildDeploymentSteps(mode);

    useEffect(() => {
        setEncryptionKey(generateDeploymentSecret());
        setInstallToken(generateDeploymentSecret());
        setMaintenanceToken(generateDeploymentSecret());
        setWorkerToken(generateDeploymentSecret());
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    const changeMode = (nextMode: DeployMode) => {
        const option = modeOptions.find((item) => item.value === nextMode);
        setMode(nextMode);
        if (option) {
            setHost(option.host);
            setSsl(option.ssl);
        }
    };

    const handleCopy = (key: string, text: string) => {
        if (!configurationReady) return;
        copy(text);
        setCopiedKey(key);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopiedKey(""), 1600);
    };

    return (
        <section className="overflow-hidden rounded-lg border border-slate-200/80 bg-white/78 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-3 border-b border-slate-200/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                        <Database className="size-5" />
                    </span>
                    <div>
                        <div className="text-base font-semibold text-slate-950">数据库填写</div>
                        <div className="text-xs text-slate-400">生成 PostgreSQL 环境变量</div>
                    </div>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">DATABASE_URL</div>
            </div>

            <div className="p-4">
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm sm:grid-cols-4">
                    {modeOptions.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => changeMode(option.value)}
                            className={`h-9 rounded-md font-medium transition ${mode === option.value ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <p className="mt-3 border-l-2 border-slate-300 pl-3 text-sm leading-6 text-slate-600">{selectedMode.description}</p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Field label="Host" value={host} onChange={setHost} placeholder="localhost" />
                    <Field label="Port" value={port} onChange={setPort} placeholder="5432" inputMode="numeric" />
                    <Field label="Database" value={database} onChange={setDatabase} placeholder="vozeb_pro" />
                    <Field label="User" value={username} onChange={setUsername} placeholder="vozeb_pro" />
                    <label className="block space-y-1.5 sm:col-span-2">
                        <span className="text-xs font-medium text-slate-500">Password</span>
                        <input
                            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-4 focus:ring-slate-950/10"
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="数据库用户密码"
                        />
                    </label>
                    <label className="block space-y-1.5 sm:col-span-2">
                        <span className="text-xs font-medium text-slate-500">Encryption Key</span>
                        <span className="flex gap-2">
                            <input className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-700 outline-none" value={encryptionKey} readOnly aria-label="敏感配置加密密钥" />
                            <button
                                type="button"
                                onClick={() => setEncryptionKey(generateDeploymentSecret())}
                                className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
                                title="重新生成加密密钥"
                                aria-label="重新生成加密密钥"
                            >
                                <RefreshCw className="size-4" />
                            </button>
                        </span>
                    </label>
                    <label className="block space-y-1.5 sm:col-span-2">
                        <span className="text-xs font-medium text-slate-500">Install Token</span>
                        <span className="flex gap-2">
                            <input className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-700 outline-none" value={installToken} readOnly aria-label="一次性安装令牌" />
                            <button
                                type="button"
                                onClick={() => setInstallToken(generateDeploymentSecret())}
                                className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
                                title="重新生成安装令牌"
                                aria-label="重新生成安装令牌"
                            >
                                <RefreshCw className="size-4" />
                            </button>
                        </span>
                    </label>
                    <label className="block space-y-1.5 sm:col-span-2">
                        <span className="text-xs font-medium text-slate-500">Maintenance Token</span>
                        <span className="flex gap-2">
                            <input className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-700 outline-none" value={maintenanceToken} readOnly aria-label="计划维护任务令牌" />
                            <button
                                type="button"
                                onClick={() => setMaintenanceToken(generateDeploymentSecret())}
                                className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
                                title="重新生成维护令牌"
                                aria-label="重新生成维护令牌"
                            >
                                <RefreshCw className="size-4" />
                            </button>
                        </span>
                    </label>
                    <label className="block space-y-1.5 sm:col-span-2">
                        <span className="text-xs font-medium text-slate-500">Worker Token</span>
                        <span className="flex gap-2">
                            <input className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-700 outline-none" value={workerToken} readOnly aria-label="独立 Worker 令牌" />
                            <button
                                type="button"
                                onClick={() => setWorkerToken(generateDeploymentSecret())}
                                className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
                                title="重新生成 Worker 令牌"
                                aria-label="重新生成 Worker 令牌"
                            >
                                <RefreshCw className="size-4" />
                            </button>
                        </span>
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm sm:col-span-2">
                        <span>
                            <span className="block font-medium text-slate-900">启用 SSL</span>
                            <span className="text-xs text-slate-400">云数据库按服务商要求开启</span>
                        </span>
                        <input className="size-4 accent-slate-950" type="checkbox" checked={ssl} onChange={(event) => setSsl(event.target.checked)} />
                    </label>
                </div>

                <div className="mt-4 grid gap-x-5 border-y border-slate-200 py-2 text-xs leading-5 text-slate-500 sm:grid-cols-2">
                    <FieldNote title="Host / Port" text="宝塔宿主机数据库使用 127.0.0.1；Docker 内置数据库使用 postgres。" />
                    <FieldNote title="Database / User" text="建议使用独立库和独立账号，避免和同一 PostgreSQL 内其他项目混用。" />
                    <FieldNote title="Password" text="安装页只生成配置文本，不会把数据库密码保存到浏览器或服务端。" />
                    <FieldNote title="Encryption Key" text="随机生成 32 字节密钥；部署后必须保持不变，否则已保存密钥无法解密。" />
                    <FieldNote title="Install Token" text="只用于初始化数据库和创建首个管理员；安装完成后可从服务器环境变量中移除。" />
                    <FieldNote title="Maintenance Token" text="只用于订单过期、邀请结算等外部计划维护任务。" />
                    <FieldNote title="Worker Token" text="App 与生成 Worker 共享的内部令牌，必须与维护令牌不同。" />
                </div>

                <div className="mt-5">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-950">复制部署配置</h3>
                            <p className="mt-1 text-xs leading-5 text-slate-500">一次查看一段完整配置，避免窄列和横向滚动。</p>
                        </div>
                    </div>

                    {!configurationReady ? (
                        <div className="my-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5 text-amber-900">
                            <KeyRound className="mt-0.5 size-5 shrink-0" />
                            <div>
                                <div className="text-sm font-semibold">还差数据库密码</div>
                                <p className="mt-1 text-sm leading-6 text-amber-800">请先填写上方 Password。加密密钥已自动生成，填写完成后复制按钮会立即启用。</p>
                            </div>
                        </div>
                    ) : null}

                    <div className={`${configurationReady ? "mt-3" : ""} grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1`} role="tablist" aria-label="部署配置类型">
                        {snippetOptions.map((item) => {
                            const Icon = item.icon;
                            const active = item.key === selectedSnippet.key;
                            return (
                                <button
                                    key={item.key}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => setActiveSnippet(item.key)}
                                    className={`flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition sm:text-sm ${active ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                                >
                                    <Icon className="size-4 shrink-0" />
                                    <span className="truncate">{item.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    <SnippetPanel snippet={selectedSnippet} copied={copiedKey === selectedSnippet.key} disabled={!configurationReady} onCopy={() => handleCopy(selectedSnippet.key, selectedSnippet.text)} />
                </div>

                <div className="mt-5 border-t border-slate-200 pt-5">
                    <h3 className="text-sm font-semibold text-slate-950">{selectedMode.label}部署操作顺序</h3>
                    <ol className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                        {deploymentSteps.map((step, index) => (
                            <li key={step.title} className="flex min-w-0 gap-3">
                                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[11px] font-semibold text-white">{index + 1}</span>
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-slate-900">{step.title}</div>
                                    <p className="mt-1 text-sm leading-6 text-slate-500">{step.text}</p>
                                    {step.command ? <code className="mt-1.5 block overflow-x-auto rounded bg-slate-100 px-2 py-1.5 font-mono text-[11px] leading-5 text-slate-700">{step.command}</code> : null}
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            </div>
        </section>
    );
}

type SnippetKey = "env" | "compose" | "sql";

type SnippetOption = {
    key: SnippetKey;
    label: string;
    title: string;
    description: string;
    icon: LucideIcon;
    text: string;
};

function SnippetPanel({ snippet, copied, disabled, onCopy }: { snippet: SnippetOption; copied: boolean; disabled: boolean; onCopy: () => void }) {
    const Icon = snippet.icon;
    const copyButtonColor = disabled ? "#cbd5e1" : "#020617";
    return (
        <div className="mt-3 min-w-0 overflow-hidden rounded-lg bg-slate-950 text-slate-100" role="tabpanel">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-3 sm:px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                    <Icon className="size-4 shrink-0 text-slate-300" />
                    <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white">{snippet.title}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-400">{snippet.description}</span>
                    </span>
                </div>
                <button
                    type="button"
                    onClick={onCopy}
                    disabled={disabled}
                    aria-label={`复制${snippet.label}配置`}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-white px-2.5 text-xs font-semibold transition enabled:hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-700"
                    style={{ color: copyButtonColor }}
                >
                    {copied ? <Check className="size-3.5" style={{ color: copyButtonColor }} /> : <Copy className="size-3.5" style={{ color: copyButtonColor }} />}
                    <span style={{ color: copyButtonColor }}>{copied ? "已复制" : "复制"}</span>
                </button>
            </div>
            <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-all p-4 font-mono text-[11px] leading-5 text-slate-100 sm:text-xs">{snippet.text}</pre>
        </div>
    );
}

function FieldNote({ title, text }: { title: string; text: string }) {
    return (
        <div className="px-1 py-2">
            <span className="font-semibold text-slate-700">{title}：</span>
            {text}
        </div>
    );
}

function buildDeploymentSteps(mode: DeployMode) {
    if (mode === "baota") {
        return [
            { title: "创建数据库", text: "打开上方“建库命令”，复制后在宝塔“终端”执行。已有数据库和账号时可跳过。" },
            { title: "保存环境变量", text: "复制“环境变量”，在 /www/wwwroot/vozeb-pro 下创建或更新 .env 文件。" },
            { title: "重建应用与 Worker", text: "在宝塔终端进入项目目录执行下面的命令；App 保留外部维护令牌，两个服务共享独立 Worker 令牌。", command: "docker compose -f docker-compose.baota.yml up -d --force-recreate" },
            { title: "返回安装页", text: "等待 10-30 秒，点击右侧“刷新检查”；看到连接可用后，再点击“初始化表结构”。" },
        ];
    }
    if (mode === "docker") {
        return [
            { title: "保存环境变量", text: "复制“环境变量”并保存到项目根目录 .env；内置 PostgreSQL 会由 Compose 自动创建。" },
            { title: "确认 Compose", text: "使用项目自带 docker-compose.yml，或复制上方包含 App 与生成 Worker 的完整模板。" },
            { title: "启动全部服务", text: "在项目根目录执行命令，Compose 会启动数据库、App 和生成 Worker。", command: "docker compose up -d --force-recreate" },
            { title: "完成初始化", text: "刷新安装页，确认数据库连接可用后点击“初始化表结构”，然后创建管理员。" },
        ];
    }
    if (mode === "cloud") {
        return [
            { title: "准备云数据库", text: "先在云数据库控制台创建数据库和账号，并按服务商要求放行应用服务器 IP。" },
            { title: "保存环境变量", text: "复制“环境变量”到项目根目录 .env；服务商要求 SSL 时保持“启用 SSL”开启。" },
            { title: "重启应用与 Worker", text: "重新创建两个服务，使数据库配置、加密密钥和彼此隔离的维护/Worker 令牌生效。", command: "docker compose -f docker-compose.external-db.yml up -d --force-recreate" },
            { title: "完成初始化", text: "刷新安装页，连接成功后点击“初始化表结构”，然后创建管理员。" },
        ];
    }
    return [
        { title: "创建数据库", text: "复制“建库命令”并在本机 PostgreSQL 终端执行；已有数据库和账号时可跳过。" },
        { title: "保存环境变量", text: "复制“环境变量”，保存为项目 web 目录下的 .env.local 文件。" },
        { title: "重新启动开发服务", text: "停止旧进程后，在 web 目录重新启动，环境变量才会生效。", command: "npm run dev" },
        { title: "完成初始化", text: "刷新安装页，连接成功后点击“初始化表结构”，然后创建管理员。" },
    ];
}

function Field({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; inputMode?: "numeric" }) {
    return (
        <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-500">{label}</span>
            <input
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-4 focus:ring-slate-950/10"
                value={value}
                inputMode={inputMode}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
            />
        </label>
    );
}
