"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Pagination, Select, Switch, Tag } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { BadgePercent, CalendarClock, Pencil, Plus, RefreshCw, Save, Trash2 } from "lucide-react";

import type { BillingProduct } from "@/services/api/billing";
import { adminProductLabel, createAdminPromotion, deleteAdminPromotion, listAdminPromotions, type PromotionCampaign, type PromotionCampaignInput, updateAdminPromotion } from "@/services/api/admin-billing-commerce";

const PAGE_SIZE = 12;

type PromotionFormValue = {
    name: string;
    label: string;
    enabled: boolean;
    range: [Dayjs, Dayjs];
    productIds: string[];
    prices: Record<string, number>;
};

export function PromotionCampaignPanel({ products, productsLoading }: { products: BillingProduct[]; productsLoading: boolean }) {
    const { message, modal } = App.useApp();
    const [form] = Form.useForm<PromotionFormValue>();
    const [campaigns, setCampaigns] = useState<PromotionCampaign[]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState("");
    const [editing, setEditing] = useState<PromotionCampaign | null>(null);
    const [open, setOpen] = useState(false);
    const productIds = Form.useWatch("productIds", form) || [];

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await listAdminPromotions(page, PAGE_SIZE);
            setCampaigns(result.campaigns);
            setTotal(result.total);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "加载促销活动失败");
        } finally {
            setLoading(false);
        }
    }, [message, page]);

    useEffect(() => {
        void load();
    }, [load]);

    const showCreate = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({ name: "", label: "限时优惠", enabled: true, range: [dayjs(), dayjs().add(7, "day")], productIds: [], prices: {} });
        setOpen(true);
    };

    const showEdit = (campaign: PromotionCampaign) => {
        setEditing(campaign);
        form.setFieldsValue({
            name: campaign.name,
            label: campaign.label,
            enabled: campaign.enabled,
            range: [dayjs(campaign.startsAt), dayjs(campaign.endsAt)],
            productIds: campaign.products.map((item) => item.productId),
            prices: Object.fromEntries(campaign.products.map((item) => [item.productId, item.promotionalAmountCents / 100])),
        });
        setOpen(true);
    };

    const save = async (value: PromotionFormValue) => {
        setSaving(true);
        try {
            const input: PromotionCampaignInput = {
                name: value.name.trim(),
                label: value.label.trim(),
                enabled: value.enabled,
                startsAt: value.range[0].toISOString(),
                endsAt: value.range[1].toISOString(),
                products: value.productIds.map((productId) => ({ productId, promotionalAmountCents: Math.round(Number(value.prices?.[productId] || 0) * 100) })),
            };
            if (editing) await updateAdminPromotion(editing.id, input);
            else await createAdminPromotion(input);
            message.success(editing ? "促销活动已更新" : "促销活动已创建");
            setOpen(false);
            setEditing(null);
            form.resetFields();
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存促销活动失败");
        } finally {
            setSaving(false);
        }
    };

    const remove = (campaign: PromotionCampaign) => {
        modal.confirm({
            title: `删除“${campaign.name}”？`,
            content: "已被订单引用的活动会受到保护；需要停止活动时请改为停用。",
            okText: "确认删除",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                setDeletingId(campaign.id);
                try {
                    await deleteAdminPromotion(campaign.id);
                    message.success("促销活动已删除");
                    if (campaigns.length === 1 && page > 1) setPage((current) => current - 1);
                    else await load();
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "删除促销活动失败");
                    throw error;
                } finally {
                    setDeletingId("");
                }
            },
        });
    };

    return (
        <section className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm shadow-stone-200/40 dark:border-stone-800 dark:bg-stone-950 dark:shadow-black/20">
            <div className="flex items-start justify-between gap-3 border-b border-stone-200 p-3 sm:items-center sm:p-4 dark:border-stone-800">
                <div className="min-w-0">
                    <h2 className="text-base font-semibold text-stone-950 dark:text-stone-100">促销活动</h2>
                    <p className="mt-1 text-xs leading-5 text-stone-500 sm:text-sm dark:text-stone-400">活动价由服务端按生效时间解析，同一商品不能配置重叠活动。</p>
                </div>
                <div className="flex shrink-0 gap-2">
                    <Button icon={<RefreshCw className="size-4" />} loading={loading} aria-label="刷新促销活动" title="刷新促销活动" onClick={() => void load()} />
                    <Button type="primary" icon={<Plus className="size-4" />} disabled={!products.length || productsLoading} onClick={showCreate}>
                        <span className="hidden sm:inline">创建活动</span>
                        <span className="sm:hidden">新建</span>
                    </Button>
                </div>
            </div>

            <div className="grid min-w-0 gap-2 p-3 sm:gap-3 sm:p-4 lg:grid-cols-2">
                {loading && !campaigns.length ? (
                    <Loading label="正在加载促销活动" />
                ) : campaigns.length ? (
                    campaigns.map((campaign) => {
                        const state = campaignState(campaign);
                        return (
                            <article key={campaign.id} className="min-w-0 rounded-lg border border-stone-200 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-900/40 sm:p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <BadgePercent className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                            <h3 className="truncate text-sm font-semibold text-stone-950 dark:text-stone-100">{campaign.name}</h3>
                                            <Tag className="m-0" color={state.color}>
                                                {state.label}
                                            </Tag>
                                        </div>
                                        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">标签：{campaign.label}</p>
                                    </div>
                                    <Tag className="m-0 shrink-0" color={campaign.enabled ? "green" : "default"}>
                                        {campaign.enabled ? "启用" : "停用"}
                                    </Tag>
                                </div>
                                <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-stone-500 dark:text-stone-400">
                                    <CalendarClock className="mt-0.5 size-3.5 shrink-0" />
                                    <span>{formatRange(campaign.startsAt, campaign.endsAt)}</span>
                                </div>
                                <div className="mt-3 space-y-1.5 border-t border-stone-200 pt-3 dark:border-stone-800">
                                    {campaign.products.map((item) => (
                                        <div key={item.productId} className="flex items-center justify-between gap-3 text-xs">
                                            <span className="min-w-0 truncate text-stone-600 dark:text-stone-300">{adminProductLabel(products, item.productId)}</span>
                                            <span className="shrink-0 font-semibold tabular-nums text-stone-950 dark:text-stone-100">¥ {formatYuan(item.promotionalAmountCents)}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-3 flex justify-end gap-2 border-t border-stone-200 pt-3 dark:border-stone-800">
                                    <Button size="small" icon={<Pencil className="size-3.5" />} onClick={() => showEdit(campaign)}>
                                        编辑
                                    </Button>
                                    <Button danger size="small" icon={<Trash2 className="size-3.5" />} loading={deletingId === campaign.id} onClick={() => remove(campaign)}>
                                        删除
                                    </Button>
                                </div>
                            </article>
                        );
                    })
                ) : (
                    <Empty label="暂无促销活动" />
                )}
            </div>
            {total > PAGE_SIZE ? <Pagination className="px-3 pb-4 sm:px-4" size="small" current={page} pageSize={PAGE_SIZE} total={total} showSizeChanger={false} onChange={setPage} /> : null}

            <Modal
                title={editing ? "编辑促销活动" : "创建促销活动"}
                open={open}
                width={760}
                centered
                destroyOnHidden
                onCancel={() => (saving ? undefined : setOpen(false))}
                styles={{ body: { maxHeight: "min(70dvh, 680px)", overflowY: "auto", paddingTop: 8 } }}
                footer={[
                    <Button key="cancel" disabled={saving} onClick={() => setOpen(false)}>
                        取消
                    </Button>,
                    <Button key="save" type="primary" icon={<Save className="size-4" />} loading={saving} onClick={() => form.submit()}>
                        保存活动
                    </Button>,
                ]}
            >
                <Form form={form} layout="vertical" onFinish={(value) => void save(value)}>
                    <div className="grid gap-x-3 sm:grid-cols-2">
                        <Form.Item name="name" label="活动名称" rules={[{ required: true, message: "请填写活动名称" }]}>
                            <Input maxLength={80} placeholder="例如：暑期创作季" />
                        </Form.Item>
                        <Form.Item name="label" label="用户端标签" rules={[{ required: true, message: "请填写促销标签" }]}>
                            <Input maxLength={40} placeholder="例如：限时 8 折" />
                        </Form.Item>
                    </div>
                    <Form.Item name="range" label="生效时间" rules={[{ required: true, message: "请选择活动时间" }]}>
                        <DatePicker.RangePicker className="w-full" showTime />
                    </Form.Item>
                    <Form.Item name="productIds" label="活动商品" rules={[{ required: true, message: "请至少选择一个商品" }]}>
                        <Select mode="multiple" optionFilterProp="label" placeholder="选择已配置日常价的商品" options={products.map((product) => ({ value: product.id, label: `${product.name} · ¥${formatYuan(product.amountCents)}` }))} />
                    </Form.Item>
                    {productIds.length ? (
                        <div className="grid gap-x-3 rounded-lg border border-stone-200 bg-stone-50/70 p-3 sm:grid-cols-2 dark:border-stone-800 dark:bg-stone-900/45">
                            {productIds.map((productId) => {
                                const product = products.find((item) => item.id === productId);
                                return (
                                    <Form.Item key={productId} name={["prices", productId]} label={`${product?.name || productId}活动价`} rules={[{ required: true, message: "请填写活动价" }]}>
                                        <InputNumber className="w-full" min={0.01} max={Math.max(0.01, (product?.amountCents || 1) / 100 - 0.01)} precision={2} prefix="¥" />
                                    </Form.Item>
                                );
                            })}
                        </div>
                    ) : null}
                    <Form.Item className="mt-3" name="enabled" label="活动状态" valuePropName="checked">
                        <Switch checkedChildren="启用" unCheckedChildren="停用" />
                    </Form.Item>
                </Form>
            </Modal>
        </section>
    );
}

function campaignState(campaign: PromotionCampaign) {
    const now = Date.now();
    if (!campaign.enabled) return { label: "已停用", color: "default" };
    if (Date.parse(campaign.startsAt) > now) return { label: "待生效", color: "blue" };
    if (Date.parse(campaign.endsAt) <= now) return { label: "已结束", color: "default" };
    return { label: "进行中", color: "green" };
}

function formatRange(startsAt: string, endsAt: string) {
    const options: Intl.DateTimeFormatOptions = { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false };
    return `${new Date(startsAt).toLocaleString("zh-CN", options)} - ${new Date(endsAt).toLocaleString("zh-CN", options)}`;
}

function formatYuan(amountCents: number) {
    return (Math.max(0, amountCents) / 100).toLocaleString("zh-CN", { minimumFractionDigits: amountCents % 100 ? 2 : 0, maximumFractionDigits: 2 });
}

function Loading({ label }: { label: string }) {
    return (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-stone-200 px-3 py-10 text-sm text-stone-500 lg:col-span-2 dark:border-stone-800 dark:text-stone-400">
            <RefreshCw className="size-4 animate-spin" /> {label}
        </div>
    );
}

function Empty({ label }: { label: string }) {
    return <div className="rounded-lg border border-dashed border-stone-200 px-3 py-10 text-center text-sm text-stone-500 lg:col-span-2 dark:border-stone-800 dark:text-stone-400">{label}</div>;
}
