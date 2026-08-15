"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { App, Button, Input, Modal, Select, Table, Tag } from "antd";
import type { TableColumnsType } from "antd";
import { AlertTriangle, FileUp, RefreshCw, Search } from "lucide-react";

import type { BillingReconciliationResult, BillingReconciliationRow, BillingReconciliationRun } from "@/lib/admin-billing-types";

type BillingReconciliationImportProps = {
    open: boolean;
    onClose: () => void;
};

const providerOptions = [
    { label: "Stripe", value: "stripe" },
    { label: "支付宝", value: "alipay" },
    { label: "微信支付", value: "wechat" },
    { label: "PayPly", value: "payply" },
    { label: "人工确认", value: "manual" },
];

const sampleCsv = "商户订单号,支付流水号,金额,币种,状态\nVZ202607160001,ch_123,19.90,CNY,succeeded";

export function BillingReconciliationImport({ open, onClose }: BillingReconciliationImportProps) {
    const { message } = App.useApp();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [provider, setProvider] = useState("stripe");
    const [csvText, setCsvText] = useState("");
    const [fileName, setFileName] = useState("");
    const [loading, setLoading] = useState(false);
    const [recentLoading, setRecentLoading] = useState(false);
    const [detailLoadingId, setDetailLoadingId] = useState("");
    const [result, setResult] = useState<BillingReconciliationResult | null>(null);
    const [recentRuns, setRecentRuns] = useState<BillingReconciliationRun[]>([]);

    const loadRecentRuns = useCallback(async () => {
        setRecentLoading(true);
        try {
            const response = await fetch("/api/admin/billing/reconciliation?page=1&pageSize=6", { cache: "no-store" });
            const payload = (await response.json().catch(() => null)) as { runs?: BillingReconciliationRun[]; error?: string } | null;
            if (!response.ok || !payload?.runs) throw new Error(payload?.error || "加载最近对账记录失败");
            setRecentRuns(payload.runs);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "加载最近对账记录失败");
        } finally {
            setRecentLoading(false);
        }
    }, [message]);

    useEffect(() => {
        if (open) void loadRecentRuns();
    }, [loadRecentRuns, open]);

    const runReconciliation = async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/admin/billing/reconciliation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider, csvText, fileName }),
            });
            const payload = (await response.json().catch(() => null)) as { reconciliation?: BillingReconciliationResult; error?: string } | null;
            if (!response.ok || !payload?.reconciliation) throw new Error(payload?.error || "支付账单对账失败");
            setResult(payload.reconciliation);
            message.success(payload.reconciliation.issueRows ? "对账已保存，发现需要处理的差异" : "对账已保存，未发现异常");
            await loadRecentRuns();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "支付账单对账失败");
        } finally {
            setLoading(false);
        }
    };

    const loadRunDetail = async (runId: string) => {
        setDetailLoadingId(runId);
        try {
            const response = await fetch(`/api/admin/billing/reconciliation?runId=${encodeURIComponent(runId)}`, { cache: "no-store" });
            const payload = (await response.json().catch(() => null)) as { reconciliation?: BillingReconciliationResult; error?: string } | null;
            if (!response.ok || !payload?.reconciliation) throw new Error(payload?.error || "加载对账明细失败");
            setResult(payload.reconciliation);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "加载对账明细失败");
        } finally {
            setDetailLoadingId("");
        }
    };

    const loadCsvFile = async (file: File | undefined) => {
        if (!file) return;
        const text = await file.text();
        setCsvText(text);
        setFileName(file.name);
        setResult(null);
    };

    const close = () => {
        if (loading) return;
        onClose();
    };

    return (
        <Modal
            title="导入支付商账单对账"
            open={open}
            width={980}
            centered
            destroyOnHidden
            onCancel={close}
            footer={[
                <Button key="close" onClick={close} disabled={loading}>
                    关闭
                </Button>,
                <Button key="run" type="primary" icon={<RefreshCw className="size-4" />} loading={loading} disabled={!csvText.trim()} onClick={() => void runReconciliation()}>
                    开始对账
                </Button>,
            ]}
            styles={{ body: { maxHeight: "min(72dvh, 720px)", overflowY: "auto", paddingTop: 8 } }}
        >
            <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-end">
                    <label className="block text-sm font-medium text-stone-700 dark:text-stone-200">
                        支付渠道
                        <Select className="mt-2 w-full" value={provider} options={providerOptions} onChange={setProvider} />
                    </label>
                    <div className="min-w-0 text-xs leading-5 text-stone-500 dark:text-stone-400">支持 CSV 表头：商户订单号、支付流水号、金额、币种、状态；也兼容 order_no、payment_id、amount、currency、status。</div>
                    <Button icon={<FileUp className="size-4" />} onClick={() => fileInputRef.current?.click()}>
                        选择 CSV
                    </Button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,text/csv,text/plain"
                        hidden
                        onChange={(event) => {
                            void loadCsvFile(event.target.files?.[0]);
                            event.currentTarget.value = "";
                        }}
                    />
                </div>

                <Input.TextArea
                    value={csvText}
                    rows={8}
                    maxLength={200_000}
                    placeholder={sampleCsv}
                    onChange={(event) => {
                        setCsvText(event.target.value);
                        setFileName("");
                        setResult(null);
                    }}
                />

                {result ? <ReconciliationResultView result={result} /> : null}
                <RecentRunsTable runs={recentRuns} loading={recentLoading} detailLoadingId={detailLoadingId} onRefresh={loadRecentRuns} onOpen={(runId) => void loadRunDetail(runId)} />
            </div>
        </Modal>
    );
}

function ReconciliationResultView({ result }: { result: BillingReconciliationResult }) {
    return (
        <div className="space-y-4">
            {result.runId ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                    <Tag color={result.issueRows ? "red" : "green"} className="m-0">
                        已保存批次
                    </Tag>
                    <span className="font-mono">{result.runId}</span>
                    {result.fileName ? <span className="truncate">来源文件：{result.fileName}</span> : null}
                    {result.importedByUsername ? <span>操作人：{result.importedByUsername}</span> : null}
                </div>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-4">
                <ResultMetric label="账单行数" value={result.totalRows} />
                <ResultMetric label="匹配订单" value={result.matchedRows} />
                <ResultMetric label="正常行" value={result.okRows} />
                <ResultMetric label="异常行" value={result.issueRows} tone={result.issueRows ? "rose" : "emerald"} />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
                <ResultMetric label="支付商收款" value={formatMoney(result.totals.statementPaidAmountCents)} />
                <ResultMetric label="支付商退款" value={formatMoney(result.totals.statementRefundedAmountCents)} />
                <ResultMetric label="差额" value={formatMoney(result.totals.differenceAmountCents)} tone={result.totals.differenceAmountCents ? "rose" : "slate"} />
            </div>
            <Table rowKey={(row) => `${row.rowNumber}:${row.key}`} size="small" columns={columns} dataSource={result.rows} scroll={{ x: 980 }} pagination={{ pageSize: 8, showSizeChanger: false }} />
        </div>
    );
}

function RecentRunsTable({ runs, loading, detailLoadingId, onRefresh, onOpen }: { runs: BillingReconciliationRun[]; loading: boolean; detailLoadingId: string; onRefresh: () => void; onOpen: (runId: string) => void }) {
    const runColumns: TableColumnsType<BillingReconciliationRun> = [
        {
            title: "导入时间",
            dataIndex: "createdAt",
            width: 150,
            render: (value: string) => formatDateTime(value),
        },
        {
            title: "渠道",
            dataIndex: "provider",
            width: 110,
            render: (value: string) => providerLabel(value),
        },
        {
            title: "结果",
            width: 180,
            render: (_, run) => (
                <div className="text-xs leading-5 text-stone-600 dark:text-stone-300">
                    <div>
                        {run.totalRows} 行 / 匹配 {run.matchedRows}
                    </div>
                    <div className={run.issueRows ? "text-rose-600 dark:text-rose-300" : "text-emerald-600 dark:text-emerald-300"}>异常 {run.issueRows}</div>
                </div>
            ),
        },
        {
            title: "差额",
            width: 120,
            render: (_, run) => <span className={run.differenceAmountCents ? "text-rose-600 dark:text-rose-300" : ""}>{formatMoney(run.differenceAmountCents)}</span>,
        },
        {
            title: "操作",
            width: 110,
            render: (_, run) => (
                <Button size="small" icon={<Search className="size-3.5" />} loading={detailLoadingId === run.id} onClick={() => onOpen(run.id)}>
                    查看
                </Button>
            ),
        },
    ];

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-stone-950 dark:text-stone-100">最近对账批次</div>
                <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => onRefresh()}>
                    刷新
                </Button>
            </div>
            <Table rowKey="id" size="small" columns={runColumns} dataSource={runs} loading={loading} scroll={{ x: 720 }} pagination={false} locale={{ emptyText: "暂无对账记录" }} />
        </div>
    );
}

const columns: TableColumnsType<BillingReconciliationRow> = [
    {
        title: "行",
        dataIndex: "rowNumber",
        width: 70,
    },
    {
        title: "账单记录",
        width: 260,
        render: (_, row) => (
            <div className="min-w-0">
                <div className="truncate font-medium text-stone-950 dark:text-stone-100">{row.orderNo || row.providerPaymentId || row.providerOrderId || "-"}</div>
                <div className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">
                    {statusLabel(row.statementStatus)} / {row.amountCents === undefined ? "-" : formatMoney(row.amountCents, row.currency)}
                </div>
            </div>
        ),
    },
    {
        title: "本地订单",
        width: 240,
        render: (_, row) => (
            <div className="min-w-0">
                <div className="truncate font-medium text-stone-950 dark:text-stone-100">{row.localOrderNo || "-"}</div>
                <div className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">
                    {row.localOrderStatus || "-"} / {row.localAmountCents === undefined ? "-" : formatMoney(row.localAmountCents, row.localCurrency)}
                </div>
            </div>
        ),
    },
    {
        title: "结果",
        width: 360,
        render: (_, row) =>
            row.issues.length ? (
                <div className="flex flex-wrap gap-1.5">
                    {row.issues.map((item) => (
                        <Tag key={`${row.rowNumber}:${item.code}:${item.message}`} color={item.severity === "error" ? "red" : "gold"} className="m-0">
                            {item.message}
                        </Tag>
                    ))}
                </div>
            ) : (
                <Tag color="green" className="m-0">
                    一致
                </Tag>
            ),
    },
];

function ResultMetric({ label, value, tone = "slate" }: { label: string; value: string | number; tone?: "slate" | "rose" | "emerald" }) {
    return (
        <div
            className={`rounded-lg border px-3 py-2 ${tone === "rose" ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200" : tone === "emerald" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-stone-200 bg-stone-50 text-stone-700 dark:border-stone-800 dark:bg-stone-900/40 dark:text-stone-200"}`}
        >
            <div className="flex items-center gap-1.5 text-xs">
                {tone === "rose" ? <AlertTriangle className="size-3.5" /> : null}
                {label}
            </div>
            <div className="mt-1 text-lg font-semibold tracking-normal">{value}</div>
        </div>
    );
}

function statusLabel(status: string) {
    if (status === "paid") return "已支付";
    if (status === "refunded") return "已退款";
    if (status === "pending") return "处理中";
    if (status === "failed") return "失败/关闭";
    return "未知";
}

function providerLabel(provider: string) {
    if (provider === "stripe") return "Stripe";
    if (provider === "alipay") return "支付宝";
    if (provider === "wechat") return "微信支付";
    if (provider === "payply") return "PayPly";
    if (provider === "manual") return "人工确认";
    return provider || "-";
}

function formatMoney(cents: number, currency = "CNY") {
    const amount = (Number(cents || 0) / 100).toFixed(2);
    return currency === "CNY" ? `¥${amount}` : `${currency} ${amount}`;
}

function formatDateTime(value: string) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "-";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
