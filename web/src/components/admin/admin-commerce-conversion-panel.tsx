"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Tag } from "antd";
import { BadgePercent, CircleDollarSign, RefreshCw, TicketPercent, UserPlus } from "lucide-react";

import { Panel, PanelHeader } from "@/components/admin/admin-panel";
import { formatAdminMoney } from "@/components/admin/admin-values";
import type { AdminBillingSummary } from "@/lib/admin-billing-types";
import { getAdminReferralOverview, type AdminReferralStats } from "@/services/api/referrals";

import { formatConversionRate } from "./admin-commerce-conversion";

type AdminCommerceConversionPanelProps = {
    billingSummary: AdminBillingSummary | null;
    billingLoading: boolean;
    onRefreshBilling: () => Promise<void>;
};

export function AdminCommerceConversionPanel({ billingSummary, billingLoading, onRefreshBilling }: AdminCommerceConversionPanelProps) {
    const requestIdRef = useRef(0);
    const [referralStats, setReferralStats] = useState<AdminReferralStats | null>(null);
    const [referralLoading, setReferralLoading] = useState(false);
    const [referralError, setReferralError] = useState("");

    const loadReferralStats = useCallback(async () => {
        const requestId = ++requestIdRef.current;
        setReferralLoading(true);
        setReferralError("");
        try {
            const data = await getAdminReferralOverview();
            if (requestId === requestIdRef.current) setReferralStats(data.stats);
        } catch (error) {
            if (requestId === requestIdRef.current) setReferralError(error instanceof Error ? error.message : "邀请数据加载失败");
        } finally {
            if (requestId === requestIdRef.current) setReferralLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadReferralStats();
        return () => {
            requestIdRef.current += 1;
        };
    }, [loadReferralStats]);

    const commerce = billingSummary?.commerce;
    const orders = billingSummary?.orders;
    const refreshing = billingLoading || referralLoading;

    return (
        <Panel>
            <PanelHeader
                title="商业转化"
                description="累计订单与邀请转化概览"
                actions={
                    <div className="flex items-center gap-2">
                        {referralError ? (
                            <Tag className="m-0" color="red">
                                邀请数据异常
                            </Tag>
                        ) : null}
                        <Button
                            icon={<RefreshCw className="size-4" />}
                            loading={refreshing}
                            onClick={() => {
                                void Promise.all([loadReferralStats(), onRefreshBilling()]);
                            }}
                        >
                            刷新转化
                        </Button>
                    </div>
                }
            />
            <div className="admin-resource-grid grid grid-cols-2 xl:grid-cols-4">
                <ConversionStat
                    label="订单成交率"
                    value={orders && commerce ? formatConversionRate(commerce.convertedOrders, orders.total) : "-"}
                    detail={orders && commerce ? `${commerce.convertedOrders} / ${orders.total} 笔` : "等待财务摘要"}
                    note={orders ? `当前实收 ${formatAdminMoney(orders.paidAmountCents)}` : "累计已支付与退款订单"}
                    icon={<CircleDollarSign className="size-4" />}
                />
                <ConversionStat
                    label="活动订单成交率"
                    value={commerce ? formatConversionRate(commerce.promotionConvertedOrders, commerce.promotionOrders) : "-"}
                    detail={commerce ? `${commerce.promotionConvertedOrders} / ${commerce.promotionOrders} 笔` : "等待财务摘要"}
                    note={commerce ? `累计活动优惠 ${formatAdminMoney(commerce.promotionDiscountCents)}` : "仅统计真实活动订单"}
                    icon={<BadgePercent className="size-4" />}
                />
                <ConversionStat
                    label="用券订单成交率"
                    value={commerce ? formatConversionRate(commerce.couponConvertedOrders, commerce.couponOrders) : "-"}
                    detail={commerce ? `${commerce.couponConvertedOrders} / ${commerce.couponOrders} 笔` : "等待财务摘要"}
                    note={commerce ? `累计优惠券优惠 ${formatAdminMoney(commerce.couponDiscountCents)}` : "仅统计真实用券订单"}
                    icon={<TicketPercent className="size-4" />}
                />
                <ConversionStat
                    label="邀请注册率"
                    value={referralStats ? formatConversionRate(referralStats.registrations, referralStats.clicks) : "-"}
                    detail={referralStats ? `${referralStats.registrations} / ${referralStats.clicks} 次` : referralError || "正在读取邀请数据"}
                    note={referralStats ? `首单触发 ${referralStats.qualified} · 已发放 ${referralStats.settled}` : "点击、注册与首单分层统计"}
                    icon={<UserPlus className="size-4" />}
                />
            </div>
        </Panel>
    );
}

function ConversionStat({ label, value, detail, note, icon }: { label: string; value: string; detail: string; note: string; icon: ReactNode }) {
    return (
        <div className="admin-resource-stat min-w-0 p-3 sm:p-5">
            <div className="flex min-w-0 items-center justify-between gap-2 text-zinc-500 dark:text-zinc-400">
                <span className="truncate text-[10px] font-medium sm:text-xs">{label}</span>
                <span className="shrink-0">{icon}</span>
            </div>
            <div className="mt-2 text-xl font-semibold tabular-nums text-zinc-950 sm:text-2xl dark:text-zinc-100">{value}</div>
            <div className="mt-1 truncate text-[10px] tabular-nums text-zinc-500 sm:text-xs dark:text-zinc-400">{detail}</div>
            <div className="mt-2 line-clamp-2 text-[10px] leading-4 text-zinc-400 sm:text-[11px] dark:text-zinc-500">{note}</div>
        </div>
    );
}
