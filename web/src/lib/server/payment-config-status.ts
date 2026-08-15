import {
    DEFAULT_ALIPAY_PAYMENT_MODE,
    getAlipayPaymentModePresentation,
    PAYMENT_PROVIDER_DEFINITIONS,
    type PaymentConfigRequirement,
    type PaymentConfigSummary,
    type PaymentProviderConfig,
    type PaymentProviderConfigField,
    type PaymentProviderDefinition,
} from "@/lib/payment-config-types";
import { fieldHasRuntimeValue, getFieldRuntimeValue, getPaymentRuntimeConfig, hasPaymentProductionSecret, isPaymentRuntimeProviderEnabled, type PaymentRuntimeConfig } from "@/lib/server/payment-config-store";

export async function getPaymentConfigSummary(origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"): Promise<PaymentConfigSummary> {
    const normalizedOrigin = normalizeOrigin(origin);
    const runtimeConfig = await getPaymentRuntimeConfig();
    const providers = PAYMENT_PROVIDER_DEFINITIONS.map((provider) => buildProviderConfig(provider, runtimeConfig, normalizedOrigin));
    return {
        origin: normalizedOrigin,
        readyProviders: providers.filter((provider) => provider.enabled && provider.ready && provider.id !== "manual").length,
        providers,
        generatedAt: new Date().toISOString(),
    };
}

export { hasPaymentProductionSecret };

function buildProviderConfig(provider: PaymentProviderDefinition, runtimeConfig: PaymentRuntimeConfig, origin: string): PaymentProviderConfig {
    const fields = provider.fields.map((field) => resolveField(field, runtimeConfig));
    const presentation = providerPresentation(provider, fields);
    const checkoutRequirements = provider.checkoutFieldKeys.map((key) => resolveRequirement(provider, key, runtimeConfig));
    const webhookRequirements = provider.webhookFieldKeys.map((key) => resolveRequirement(provider, key, runtimeConfig));
    const enabled = isPaymentRuntimeProviderEnabled(runtimeConfig, provider.id);
    const checkoutReady = provider.id === "manual" || checkoutRequirements.every((item) => item.configured);
    const webhookReady = provider.webhookOptional ? webhookRequirements.every((item) => item.configured) : webhookRequirements.every((item) => item.configured);
    const ready = provider.id === "manual" ? true : enabled && checkoutReady && webhookReady;
    const webhookPath = `/api/billing/webhooks/${provider.id === "manual" ? "custom" : provider.id}`;
    return {
        id: provider.id,
        name: provider.name,
        description: presentation.description,
        checkoutKind: presentation.checkoutKind,
        checkoutReady: provider.id === "manual" || (enabled && checkoutReady),
        webhookReady,
        ready,
        enabled,
        sourceLabel: sourceLabel(provider, runtimeConfig),
        webhookOptional: provider.webhookOptional,
        webhookPath,
        webhookUrl: `${origin}${webhookPath}`,
        fields,
        checkoutRequirements,
        webhookRequirements,
        optionalEnvNames: provider.fields.filter((field) => !field.required).flatMap((field) => field.envNames),
    };
}

function resolveField(field: PaymentProviderConfigField, runtimeConfig: PaymentRuntimeConfig) {
    const configured = fieldHasRuntimeValue(runtimeConfig, field);
    const runtimeValue = getFieldRuntimeValue(runtimeConfig, field);
    return {
        ...field,
        configured,
        value: field.secret ? undefined : runtimeValue,
        sourceLabel: sourceLabelForField(field, runtimeConfig),
    };
}

function providerPresentation(provider: PaymentProviderDefinition, fields: PaymentProviderConfig["fields"]) {
    if (provider.id !== "alipay") return provider;
    const value = fields.find((field) => field.key === "mode")?.value || DEFAULT_ALIPAY_PAYMENT_MODE;
    return getAlipayPaymentModePresentation(value) || { description: "支付宝接入方式无效，请重新选择官方支付或当面付。", checkoutKind: "待选择" };
}

function resolveRequirement(provider: PaymentProviderDefinition, key: string, runtimeConfig: PaymentRuntimeConfig): PaymentConfigRequirement {
    const field = provider.fields.find((item) => item.key === key);
    if (!field) return { label: key, envNames: [], configured: false };
    return {
        label: field.label,
        envNames: field.envNames,
        configured: fieldHasRuntimeValue(runtimeConfig, field),
        note: field.note,
    };
}

function sourceLabel(provider: PaymentProviderDefinition, runtimeConfig: PaymentRuntimeConfig) {
    const saved = runtimeConfig.saved.providers[provider.id];
    const hasSavedValues = Boolean(saved && Object.values(saved.values).some(hasPaymentProductionSecret));
    const hasEnvValues = provider.fields.some((field) => field.envNames.some((name) => hasPaymentProductionSecret(process.env[name])));
    if (hasSavedValues && hasEnvValues) return "后台配置 + 环境变量";
    if (hasSavedValues) return "后台配置";
    if (hasEnvValues) return "环境变量";
    return provider.id === "manual" ? "无需配置" : "未配置";
}

function sourceLabelForField(field: PaymentProviderConfigField, runtimeConfig: PaymentRuntimeConfig) {
    const savedValue = field.envNames.map((name) => runtimeConfig.valuesByEnvName[name]).find(Boolean);
    const envValue = field.envNames.map((name) => process.env[name]?.trim()).find(Boolean);
    if (hasPaymentProductionSecret(savedValue) && hasPaymentProductionSecret(envValue)) return "后台 + 环境";
    if (hasPaymentProductionSecret(savedValue)) return "后台";
    if (hasPaymentProductionSecret(envValue)) return "环境";
    if (hasPaymentProductionSecret(field.defaultValue)) return "系统默认";
    return "未配置";
}

function normalizeOrigin(value: string) {
    const text = value.trim() || "http://localhost:3000";
    return text.replace(/\/+$/, "");
}
