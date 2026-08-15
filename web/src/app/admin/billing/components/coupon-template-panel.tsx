"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Pagination, Select, Switch, Tag } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { Gift, Pencil, Plus, RefreshCw, Save, Send, TicketPercent, Trash2 } from "lucide-react";

import { AdminUserSearchSelect } from "@/components/admin/admin-user-identity";
import type { BillingProduct, CouponTemplate } from "@/services/api/billing";
import { adminProductLabel, createAdminCouponTemplate, deleteAdminCouponTemplate, grantAdminCoupon, listAdminCouponTemplates, type CouponTemplateInput, updateAdminCouponTemplate } from "@/services/api/admin-billing-commerce";

const PAGE_SIZE = 12;

type CouponFormValue = {
    code: string;
    name: string;
    description: string;
    discountType: "fixed" | "percentage";
    discountValue: number;
    minimumAmountYuan: number;
    maximumDiscountYuan: number;
    stackWithPromotion: boolean;
    claimable: boolean;
    enabled: boolean;
    range: [Dayjs, Dayjs];
    totalLimit: number;
    perUserLimit: number;
    productIds: string[];
};

export function CouponTemplatePanel({ products, productsLoading }: { products: BillingProduct[]; productsLoading: boolean }) {
    const { message, modal } = App.useApp();
    const [form] = Form.useForm<CouponFormValue>();
    const [grantForm] = Form.useForm<{ userId: string; templateId: string }>();
    const [templates, setTemplates] = useState<CouponTemplate[]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [granting, setGranting] = useState(false);
    const [deletingId, setDeletingId] = useState("");
    const [editing, setEditing] = useState<CouponTemplate | null>(null);
    const [open, setOpen] = useState(false);
    const [grantOpen, setGrantOpen] = useState(false);
    const discountType = Form.useWatch("discountType", form) || "fixed";

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await listAdminCouponTemplates(page, PAGE_SIZE);
            setTemplates(result.templates);
            setTotal(result.total);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "加载优惠券模板失败");
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
        form.setFieldsValue({
            code: "",
            name: "",
            description: "",
            discountType: "fixed",
            discountValue: 10,
            minimumAmountYuan: 0,
            maximumDiscountYuan: 0,
            stackWithPromotion: false,
            claimable: true,
            enabled: true,
            range: [dayjs(), dayjs().add(30, "day")],
            totalLimit: 0,
            perUserLimit: 1,
            productIds: [],
        });
        setOpen(true);
    };

    const showEdit = (template: CouponTemplate) => {
        setEditing(template);
        form.setFieldsValue({
            code: template.code,
            name: template.name,
            description: template.description,
            discountType: template.discountType,
            discountValue: template.discountType === "fixed" ? template.discountValue / 100 : template.discountValue / 100,
            minimumAmountYuan: template.minimumAmountCents / 100,
            maximumDiscountYuan: template.maximumDiscountCents / 100,
            stackWithPromotion: template.stackWithPromotion,
            claimable: template.claimable,
            enabled: template.enabled,
            range: [dayjs(template.startsAt), dayjs(template.endsAt)],
            totalLimit: template.totalLimit,
            perUserLimit: template.perUserLimit,
            productIds: template.productIds,
        });
        setOpen(true);
    };

    const save = async (value: CouponFormValue) => {
        setSaving(true);
        try {
            const input: CouponTemplateInput = {
                code: value.code.trim().toUpperCase(),
                name: value.name.trim(),
                description: value.description?.trim() || "",
                discountType: value.discountType,
                discountValue: Math.round(Number(value.discountValue || 0) * 100),
                minimumAmountCents: Math.round(Number(value.minimumAmountYuan || 0) * 100),
                maximumDiscountCents: Math.round(Number(value.maximumDiscountYuan || 0) * 100),
                stackWithPromotion: value.stackWithPromotion,
                claimable: value.claimable,
                enabled: value.enabled,
                startsAt: value.range[0].toISOString(),
                endsAt: value.range[1].toISOString(),
                totalLimit: value.totalLimit,
                perUserLimit: value.perUserLimit,
                productIds: value.productIds || [],
            };
            if (editing) await updateAdminCouponTemplate(editing.id, input);
            else await createAdminCouponTemplate(input);
            message.success(editing ? "优惠券模板已更新" : "优惠券模板已创建");
            setOpen(false);
            setEditing(null);
            form.resetFields();
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存优惠券模板失败");
        } finally {
            setSaving(false);
        }
    };

    const grant = async (value: { userId: string; templateId: string }) => {
        setGranting(true);
        try {
            await grantAdminCoupon({ userId: value.userId.trim(), templateId: value.templateId });
            message.success("优惠券已发放");
            setGrantOpen(false);
            grantForm.resetFields();
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "发放优惠券失败");
        } finally {
            setGranting(false);
        }
    };

    const remove = (template: CouponTemplate) => {
        modal.confirm({
            title: `删除“${template.name}”？`,
            content: "已发放的模板会受到保护；停止领取或使用时请改为停用。",
            okText: "确认删除",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                setDeletingId(template.id);
                try {
                    await deleteAdminCouponTemplate(template.id);
                    message.success("优惠券模板已删除");
                    if (templates.length === 1 && page > 1) setPage((current) => current - 1);
                    else await load();
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "删除优惠券模板失败");
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
                    <h2 className="text-base font-semibold text-stone-950 dark:text-stone-100">优惠券</h2>
                    <p className="mt-1 text-xs leading-5 text-stone-500 sm:text-sm dark:text-stone-400">管理优惠规则、领取范围和发行库存，并向指定用户发放优惠券。</p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    <Button icon={<Send className="size-4" />} disabled={!templates.length} onClick={() => setGrantOpen(true)}>
                        <span className="hidden sm:inline">定向发券</span>
                    </Button>
                    <Button icon={<RefreshCw className="size-4" />} loading={loading} aria-label="刷新优惠券" title="刷新优惠券" onClick={() => void load()} />
                    <Button type="primary" icon={<Plus className="size-4" />} disabled={productsLoading} onClick={showCreate}>
                        <span className="hidden sm:inline">创建优惠券</span>
                        <span className="sm:hidden">新建</span>
                    </Button>
                </div>
            </div>

            <div className="grid min-w-0 gap-2 p-3 sm:gap-3 sm:p-4 lg:grid-cols-2">
                {loading && !templates.length ? (
                    <Loading />
                ) : templates.length ? (
                    templates.map((template) => {
                        const state = templateState(template);
                        return (
                            <article key={template.id} className="min-w-0 rounded-lg border border-stone-200 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-900/40 sm:p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <TicketPercent className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                                            <h3 className="truncate text-sm font-semibold text-stone-950 dark:text-stone-100">{template.name}</h3>
                                            <Tag className="m-0" color={state.color}>
                                                {state.label}
                                            </Tag>
                                        </div>
                                        <div className="mt-2 font-mono text-xs text-stone-500 dark:text-stone-400">{template.code}</div>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <div className="text-lg font-semibold tabular-nums text-stone-950 dark:text-stone-100">{discountLabel(template)}</div>
                                        <div className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">{template.minimumAmountCents ? `满 ¥${formatYuan(template.minimumAmountCents)} 可用` : "无使用门槛"}</div>
                                    </div>
                                </div>
                                <div className="mt-3 grid grid-cols-3 gap-2 border-y border-stone-200 py-3 text-center dark:border-stone-800">
                                    <Fact label="已发行" value={`${template.issuedCount}${template.totalLimit ? ` / ${template.totalLimit}` : ""}`} />
                                    <Fact label="已核销" value={String(template.redeemedCount)} />
                                    <Fact label="每人限领" value={`${template.perUserLimit} 张`} />
                                </div>
                                <div className="mt-3 flex min-w-0 flex-wrap gap-1.5">
                                    <Tag className="m-0">{template.productIds.length ? `${template.productIds.length} 个指定商品` : "全部商品"}</Tag>
                                    <Tag className="m-0" color={template.stackWithPromotion ? "green" : "default"}>
                                        {template.stackWithPromotion ? "可叠加活动" : "不叠加活动"}
                                    </Tag>
                                    <Tag className="m-0" color={template.claimable ? "blue" : "default"}>
                                        {template.claimable ? "可主动领取" : "仅后台发放"}
                                    </Tag>
                                </div>
                                {template.productIds.length ? <p className="mt-2 truncate text-xs text-stone-500 dark:text-stone-400">适用：{template.productIds.map((id) => adminProductLabel(products, id)).join("、")}</p> : null}
                                <div className="mt-3 flex justify-end gap-2 border-t border-stone-200 pt-3 dark:border-stone-800">
                                    <Button size="small" icon={<Pencil className="size-3.5" />} onClick={() => showEdit(template)}>
                                        编辑
                                    </Button>
                                    <Button danger size="small" icon={<Trash2 className="size-3.5" />} loading={deletingId === template.id} onClick={() => remove(template)}>
                                        删除
                                    </Button>
                                </div>
                            </article>
                        );
                    })
                ) : (
                    <Empty />
                )}
            </div>
            {total > PAGE_SIZE ? <Pagination className="px-3 pb-4 sm:px-4" size="small" current={page} pageSize={PAGE_SIZE} total={total} showSizeChanger={false} onChange={setPage} /> : null}

            <Modal
                title={editing ? "编辑优惠券" : "创建优惠券"}
                open={open}
                width={820}
                centered
                destroyOnHidden
                onCancel={() => (saving ? undefined : setOpen(false))}
                styles={{ body: { maxHeight: "min(72dvh, 720px)", overflowY: "auto", paddingTop: 8 } }}
                footer={[
                    <Button key="cancel" disabled={saving} onClick={() => setOpen(false)}>
                        取消
                    </Button>,
                    <Button key="save" type="primary" icon={<Save className="size-4" />} loading={saving} onClick={() => form.submit()}>
                        保存优惠券
                    </Button>,
                ]}
            >
                <Form form={form} layout="vertical" onFinish={(value) => void save(value)}>
                    {editing?.issuedCount ? (
                        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                            优惠券已经发行，折扣、门槛、范围和有效期不可修改，只能调整说明、开关和发行总量。
                        </div>
                    ) : null}
                    <div className="grid gap-x-3 sm:grid-cols-2">
                        <Form.Item name="name" label="优惠券名称" rules={[{ required: true, message: "请填写优惠券名称" }]}>
                            <Input maxLength={80} placeholder="例如：新用户立减券" />
                        </Form.Item>
                        <Form.Item name="code" label="领取码" rules={[{ required: true, message: "请填写领取码" }]}>
                            <Input disabled={Boolean(editing?.issuedCount)} maxLength={40} placeholder="例如：WELCOME20" />
                        </Form.Item>
                    </div>
                    <Form.Item name="description" label="用户端说明">
                        <Input.TextArea rows={2} maxLength={300} placeholder="简要说明优惠券用途" />
                    </Form.Item>
                    <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Form.Item name="discountType" label="优惠类型">
                            <Select
                                disabled={Boolean(editing?.issuedCount)}
                                options={[
                                    { label: "固定金额", value: "fixed" },
                                    { label: "比例折扣", value: "percentage" },
                                ]}
                            />
                        </Form.Item>
                        <Form.Item name="discountValue" label={discountType === "fixed" ? "优惠金额" : "优惠比例"} rules={[{ required: true, message: "请填写优惠值" }]}>
                            <InputNumber
                                disabled={Boolean(editing?.issuedCount)}
                                className="w-full"
                                min={0.01}
                                max={discountType === "fixed" ? 1_000_000 : 100}
                                precision={2}
                                prefix={discountType === "fixed" ? "¥" : undefined}
                                suffix={discountType === "percentage" ? "%" : undefined}
                            />
                        </Form.Item>
                        <Form.Item name="minimumAmountYuan" label="使用门槛">
                            <InputNumber disabled={Boolean(editing?.issuedCount)} className="w-full" min={0} precision={2} prefix="¥" />
                        </Form.Item>
                        <Form.Item name="maximumDiscountYuan" label="最高优惠" extra="0 表示不封顶">
                            <InputNumber disabled={Boolean(editing?.issuedCount)} className="w-full" min={0} precision={2} prefix="¥" />
                        </Form.Item>
                    </div>
                    <Form.Item name="range" label="有效期" rules={[{ required: true, message: "请选择有效期" }]}>
                        <DatePicker.RangePicker disabled={Boolean(editing?.issuedCount)} className="w-full" showTime />
                    </Form.Item>
                    <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-3">
                        <Form.Item name="totalLimit" label="发行总量" extra="0 表示不限量">
                            <InputNumber className="w-full" min={editing?.issuedCount || 0} precision={0} />
                        </Form.Item>
                        <Form.Item name="perUserLimit" label="每用户限领">
                            <InputNumber disabled={Boolean(editing?.issuedCount)} className="w-full" min={1} max={100} precision={0} />
                        </Form.Item>
                        <Form.Item name="productIds" label="适用商品" extra="不选择表示全部商品">
                            <Select disabled={Boolean(editing?.issuedCount)} mode="multiple" optionFilterProp="label" options={products.map((product) => ({ value: product.id, label: product.name }))} />
                        </Form.Item>
                    </div>
                    <div className="grid gap-x-3 sm:grid-cols-3">
                        <Form.Item name="stackWithPromotion" label="与活动叠加" valuePropName="checked">
                            <Switch disabled={Boolean(editing?.issuedCount)} checkedChildren="允许" unCheckedChildren="不允许" />
                        </Form.Item>
                        <Form.Item name="claimable" label="用户主动领取" valuePropName="checked">
                            <Switch checkedChildren="允许" unCheckedChildren="关闭" />
                        </Form.Item>
                        <Form.Item name="enabled" label="模板状态" valuePropName="checked">
                            <Switch checkedChildren="启用" unCheckedChildren="停用" />
                        </Form.Item>
                    </div>
                </Form>
            </Modal>

            <Modal
                title="向用户发放优惠券"
                open={grantOpen}
                width={520}
                centered
                destroyOnHidden
                onCancel={() => (granting ? undefined : setGrantOpen(false))}
                footer={[
                    <Button key="cancel" disabled={granting} onClick={() => setGrantOpen(false)}>
                        取消
                    </Button>,
                    <Button key="grant" type="primary" icon={<Gift className="size-4" />} loading={granting} onClick={() => grantForm.submit()}>
                        确认发放
                    </Button>,
                ]}
            >
                <Form form={grantForm} layout="vertical" onFinish={(value) => void grant(value)}>
                    <Form.Item name="userId" label="发放用户" extra="可按昵称、用户名、邮箱或公开用户 ID 搜索" rules={[{ required: true, message: "请选择用户" }]}>
                        <AdminUserSearchSelect activeOnly />
                    </Form.Item>
                    <Form.Item name="templateId" label="优惠券" rules={[{ required: true, message: "请选择优惠券" }]}>
                        <Select optionFilterProp="label" options={templates.filter((item) => item.enabled).map((item) => ({ value: item.id, label: `${item.name} · ${item.code}` }))} />
                    </Form.Item>
                </Form>
            </Modal>
        </section>
    );
}

function templateState(template: CouponTemplate) {
    const now = Date.now();
    if (!template.enabled) return { label: "已停用", color: "default" };
    if (Date.parse(template.startsAt) > now) return { label: "待生效", color: "blue" };
    if (Date.parse(template.endsAt) <= now) return { label: "已过期", color: "default" };
    if (template.totalLimit > 0 && template.issuedCount >= template.totalLimit) return { label: "已领完", color: "orange" };
    return { label: "发行中", color: "green" };
}

function discountLabel(template: CouponTemplate) {
    if (template.discountType === "fixed") return `¥ ${formatYuan(template.discountValue)}`;
    return `${formatNumber(template.discountValue / 100)}%`;
}

function formatYuan(amountCents: number) {
    return (Math.max(0, amountCents) / 100).toLocaleString("zh-CN", { minimumFractionDigits: amountCents % 100 ? 2 : 0, maximumFractionDigits: 2 });
}

function formatNumber(value: number) {
    return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <div className="text-[11px] text-stone-500 dark:text-stone-400">{label}</div>
            <div className="mt-1 truncate text-xs font-semibold tabular-nums text-stone-900 dark:text-stone-100">{value}</div>
        </div>
    );
}

function Loading() {
    return (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-stone-200 px-3 py-10 text-sm text-stone-500 lg:col-span-2 dark:border-stone-800 dark:text-stone-400">
            <RefreshCw className="size-4 animate-spin" /> 正在加载优惠券
        </div>
    );
}

function Empty() {
    return <div className="rounded-lg border border-dashed border-stone-200 px-3 py-10 text-center text-sm text-stone-500 lg:col-span-2 dark:border-stone-800 dark:text-stone-400">暂无优惠券模板</div>;
}
