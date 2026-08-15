"use client";

import { useState } from "react";
import { App, Button, Input, Pagination, Tag } from "antd";
import { Clock3, Gift, RefreshCw, TicketPercent } from "lucide-react";

import { claimBillingCoupon, type CouponTemplate, type UserCoupon } from "@/services/api/billing";
import { CompactEmptyState } from "@/components/compact-empty-state";

import { COUPON_PAGE_SIZE, LoadingBlock, profilePrimaryButtonClass, profileSecondaryButtonClass } from "./profile-elements";

type CouponWalletSectionProps = {
    coupons: UserCoupon[];
    templates: CouponTemplate[];
    templatesTotal: number;
    templatePage: number;
    total: number;
    page: number;
    loading: boolean;
    onRefresh: () => Promise<void> | void;
    onTemplatePageChange: (page: number) => Promise<void> | void;
    onPageChange: (page: number) => void;
    onClaimed: () => Promise<void> | void;
};

export function CouponWalletSection({ coupons, templates, templatesTotal, templatePage, total, page, loading, onRefresh, onTemplatePageChange, onPageChange, onClaimed }: CouponWalletSectionProps) {
    const { message } = App.useApp();
    const [code, setCode] = useState("");
    const [claiming, setClaiming] = useState("");

    const claim = async (input: { code?: string; templateId?: string }, key: string) => {
        setClaiming(key);
        try {
            await claimBillingCoupon(input);
            message.success("优惠券已领取");
            setCode("");
            await onClaimed();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "领取优惠券失败");
        } finally {
            setClaiming("");
        }
    };

    return (
        <section className="rounded-lg border border-border bg-card p-2 text-card-foreground sm:rounded-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-stone-950 sm:text-xl dark:text-white">我的优惠券</h2>
                    <p className="mt-1 text-xs leading-5 text-stone-500 sm:text-sm sm:leading-6 dark:text-stone-400">领取并查看可用于套餐结算的优惠券，实际优惠以结算页服务端报价为准。</p>
                </div>
                <Button className={`${profileSecondaryButtonClass} shrink-0`} icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void onRefresh()}>
                    <span className="hidden sm:inline">刷新</span>
                </Button>
            </div>

            <div className="mt-3 grid gap-2 border-t border-stone-200 pt-3 sm:mt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:pt-5 dark:border-stone-800">
                <Input
                    value={code}
                    maxLength={40}
                    prefix={<TicketPercent className="size-4 text-stone-400" />}
                    placeholder="输入优惠券领取码"
                    onChange={(event) => setCode(event.target.value.toUpperCase())}
                    onPressEnter={() => (code.trim() ? void claim({ code: code.trim() }, "code") : undefined)}
                />
                <Button className={profilePrimaryButtonClass} type="primary" icon={<Gift className="size-4" />} loading={claiming === "code"} disabled={!code.trim()} onClick={() => void claim({ code: code.trim() }, "code")}>
                    领取优惠券
                </Button>
            </div>

            {templates.length ? (
                <div className="mt-4 sm:mt-5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-stone-950 dark:text-stone-100">可领取</h3>
                        <span className="text-xs text-stone-400 dark:text-stone-500">共 {templatesTotal} 个活动</span>
                    </div>
                    <div className="grid gap-2 lg:grid-cols-2">
                        {templates.map((template) => (
                            <article key={template.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-dashed border-rose-200 bg-rose-50/55 p-3 dark:border-rose-900/50 dark:bg-rose-950/15">
                                <div className="min-w-0">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="shrink-0 text-base font-semibold text-rose-700 dark:text-rose-200">{discountLabel(template)}</span>
                                        <span className="truncate text-sm font-semibold text-stone-950 dark:text-stone-100">{template.name}</span>
                                    </div>
                                    <p className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">
                                        {template.minimumAmountCents ? `满 ¥${formatYuan(template.minimumAmountCents)} 可用` : "无使用门槛"} · 至 {formatDate(template.endsAt)}
                                    </p>
                                </div>
                                <Button size="small" icon={<Gift className="size-3.5" />} loading={claiming === template.id} onClick={() => void claim({ templateId: template.id }, template.id)}>
                                    领取
                                </Button>
                            </article>
                        ))}
                    </div>
                    {templatesTotal > COUPON_PAGE_SIZE ? (
                        <div className="mt-3 flex justify-center sm:justify-end">
                            <Pagination size="small" current={templatePage} pageSize={COUPON_PAGE_SIZE} total={templatesTotal} showLessItems showSizeChanger={false} disabled={loading} onChange={(nextPage) => void onTemplatePageChange(nextPage)} />
                        </div>
                    ) : null}
                </div>
            ) : null}

            <div className="mt-4 border-t border-stone-200 pt-4 sm:mt-5 sm:pt-5 dark:border-stone-800">
                <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-stone-950 dark:text-stone-100">已领取优惠券</h3>
                    {!loading ? <span className="text-xs text-stone-400 dark:text-stone-500">共 {total} 张</span> : null}
                </div>
                {loading ? (
                    <LoadingBlock />
                ) : coupons.length ? (
                    <>
                        <div className="grid gap-2 lg:grid-cols-2">
                            {coupons.map((coupon) => (
                                <article key={coupon.id} className="min-w-0 rounded-lg border border-stone-200 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-900/40 sm:p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-semibold text-stone-950 dark:text-stone-100">{coupon.template?.name || "优惠券"}</div>
                                            <div className="mt-1 font-mono text-xs text-stone-500 dark:text-stone-400">{coupon.template?.code || coupon.templateId}</div>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <div className="text-lg font-semibold text-rose-700 dark:text-rose-200">{coupon.template ? discountLabel(coupon.template) : "-"}</div>
                                            <Tag className="m-0 mt-1" color={couponStatusColor(coupon.status)}>
                                                {couponStatusLabel(coupon.status)}
                                            </Tag>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex items-center gap-2 border-t border-stone-200 pt-3 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
                                        <Clock3 className="size-3.5 shrink-0" />
                                        <span>有效期至 {formatDate(coupon.expiresAt)}</span>
                                        {coupon.template?.stackWithPromotion ? <span className="ml-auto shrink-0 text-emerald-700 dark:text-emerald-300">可叠加活动</span> : null}
                                    </div>
                                </article>
                            ))}
                        </div>
                        {total > COUPON_PAGE_SIZE ? (
                            <div className="mt-4 flex justify-center sm:justify-end">
                                <Pagination size="small" current={page} pageSize={COUPON_PAGE_SIZE} total={total} showLessItems showSizeChanger={false} disabled={loading} onChange={onPageChange} />
                            </div>
                        ) : null}
                    </>
                ) : (
                    <CompactEmptyState title="暂无优惠券" description="输入领取码或领取当前开放的优惠券后会显示在这里。" />
                )}
            </div>
        </section>
    );
}

function discountLabel(template: CouponTemplate) {
    if (template.discountType === "fixed") return `¥${formatYuan(template.discountValue)}`;
    return `${(template.discountValue / 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}%`;
}

function couponStatusLabel(status: UserCoupon["status"]) {
    if (status === "available") return "可使用";
    if (status === "locked") return "订单锁定";
    if (status === "redeemed") return "已使用";
    if (status === "expired") return "已过期";
    return "已撤销";
}

function couponStatusColor(status: UserCoupon["status"]) {
    if (status === "available") return "green";
    if (status === "locked") return "gold";
    if (status === "redeemed") return "blue";
    return "default";
}

function formatYuan(amountCents: number) {
    return (Math.max(0, amountCents) / 100).toLocaleString("zh-CN", { minimumFractionDigits: amountCents % 100 ? 2 : 0, maximumFractionDigits: 2 });
}

function formatDate(value: string) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "-";
}
