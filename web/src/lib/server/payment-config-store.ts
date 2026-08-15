import { createPostgresRepositories, ensurePostgresSchema, getPostgresConnectionString, isPostgresDatabaseEnabled, type JsonValue } from "@/lib/server/database";
import { readJsonDataFile, writeJsonDataFile } from "@/lib/server/data-adapter";
import { BillingInputError } from "@/lib/server/billing-errors";
import { decryptSecretValue, encryptSecretValue } from "@/lib/server/secret-crypto";
import { PAYMENT_PROVIDER_DEFINITIONS, type PaymentProviderConfigField, type PaymentProviderId, type SavedPaymentConfig, type SavedPaymentProviderConfig } from "@/lib/payment-config-types";

type PaymentRuntimeProvider = {
    enabled: boolean;
    saved: boolean;
};

export type PaymentRuntimeConfig = {
    saved: SavedPaymentConfig;
    valuesByEnvName: Record<string, string>;
    providers: Partial<Record<PaymentProviderId, PaymentRuntimeProvider>>;
};

const PAYMENT_CONFIG_FILE = "payment-config.json";
const PAYMENT_RUNTIME_CACHE_MS = 5_000;

let paymentRuntimeCache: { value: PaymentRuntimeConfig; expiresAt: number } | undefined;
let paymentRuntimePromise: Promise<PaymentRuntimeConfig> | undefined;
let paymentRuntimeGeneration = 0;

async function getSavedPaymentConfig(): Promise<SavedPaymentConfig> {
    const stored = await readStoredPaymentConfig();
    return decryptPaymentConfigSecrets(normalizeSavedPaymentConfig(stored));
}

export async function getPaymentRuntimeConfig(): Promise<PaymentRuntimeConfig> {
    const now = Date.now();
    if (paymentRuntimeCache && paymentRuntimeCache.expiresAt > now) return paymentRuntimeCache.value;
    if (paymentRuntimePromise) return paymentRuntimePromise;

    const generation = paymentRuntimeGeneration;
    const promise = buildPaymentRuntimeConfig().then((value) => {
        if (generation === paymentRuntimeGeneration) paymentRuntimeCache = { value, expiresAt: Date.now() + PAYMENT_RUNTIME_CACHE_MS };
        return value;
    });
    paymentRuntimePromise = promise;
    const clearPending = () => {
        if (paymentRuntimePromise === promise) paymentRuntimePromise = undefined;
    };
    void promise.then(clearPending, clearPending);
    return promise;
}

async function buildPaymentRuntimeConfig(): Promise<PaymentRuntimeConfig> {
    const saved = await getSavedPaymentConfig();
    const valuesByEnvName: Record<string, string> = {};
    const providers: Partial<Record<PaymentProviderId, PaymentRuntimeProvider>> = {};

    for (const definition of PAYMENT_PROVIDER_DEFINITIONS) {
        const providerConfig = saved.providers[definition.id];
        providers[definition.id] = {
            enabled: definition.id === "manual" ? true : providerConfig?.enabled !== false,
            saved: Boolean(providerConfig),
        };

        for (const field of definition.fields) {
            const value = providerConfig?.values[field.key]?.trim();
            if (!value) continue;
            for (const envName of field.envNames) valuesByEnvName[envName] = value;
        }
    }

    return { saved, valuesByEnvName, providers };
}

export async function savePaymentProviderConfig(input: { providerId: PaymentProviderId; enabled?: boolean; values?: Record<string, unknown> }) {
    const definition = findPaymentProviderDefinition(input.providerId);
    const current = await getSavedPaymentConfig();
    const previous = current.providers[input.providerId] || { enabled: definition.id === "manual", values: {} };
    const values: Record<string, string> = {};

    for (const field of definition.fields) {
        const raw = input.values && Object.prototype.hasOwnProperty.call(input.values, field.key) ? input.values[field.key] : undefined;
        if (raw === undefined) {
            values[field.key] = previous.values[field.key] || "";
            continue;
        }

        const text = normalizePaymentConfigText(raw, field.kind === "textarea" ? 20_000 : 2_000);
        if (field.options?.length && text && !field.options.some((option) => option.value === text)) {
            throw new BillingInputError(`${field.label}配置无效`, 400);
        }
        if (field.secret && !text) {
            values[field.key] = previous.values[field.key] || "";
            continue;
        }
        values[field.key] = text;
    }

    const next: SavedPaymentConfig = {
        providers: {
            ...current.providers,
            [input.providerId]: {
                enabled: definition.id === "manual" ? true : input.enabled === undefined ? previous.enabled === true : input.enabled === true,
                values,
            },
        },
    };
    invalidatePaymentRuntimeCache();
    await writeStoredPaymentConfig(encryptPaymentConfigSecrets(next));
    invalidatePaymentRuntimeCache();
    return getSavedPaymentConfig();
}

export function getPaymentRuntimeEnv(config: PaymentRuntimeConfig, name: string) {
    return config.valuesByEnvName[name]?.trim() || process.env[name]?.trim() || "";
}

export function getPaymentRuntimeValue(config: PaymentRuntimeConfig, ...names: string[]) {
    return names.map((name) => getPaymentRuntimeEnv(config, name)).find(Boolean) || "";
}

export function isPaymentRuntimeProviderEnabled(config: PaymentRuntimeConfig, provider: string) {
    const providerId = normalizePaymentProviderId(provider);
    if (providerId === "manual") return true;
    const state = providerId ? config.providers[providerId] : undefined;
    return state?.saved ? state.enabled : true;
}

export function isPaymentRuntimeProviderCheckoutReady(config: PaymentRuntimeConfig, provider: string) {
    const providerId = normalizePaymentProviderId(provider);
    if (providerId === "manual") return true;
    const definition = PAYMENT_PROVIDER_DEFINITIONS.find((item) => item.id === providerId);
    if (!definition || !isPaymentRuntimeProviderEnabled(config, definition.id)) return false;
    return definition.checkoutFieldKeys.every((key) => {
        const field = definition.fields.find((item) => item.key === key);
        return Boolean(field && fieldHasRuntimeValue(config, field));
    });
}

export function fieldHasRuntimeValue(config: PaymentRuntimeConfig, field: PaymentProviderConfigField) {
    const value = getFieldRuntimeValue(config, field);
    return hasPaymentProductionSecret(value) && (!field.options?.length || field.options.some((option) => option.value === value));
}

export function getFieldRuntimeValue(config: PaymentRuntimeConfig, field: PaymentProviderConfigField) {
    return field.envNames.map((name) => getPaymentRuntimeEnv(config, name)).find(Boolean) || field.defaultValue || "";
}

function findPaymentProviderDefinition(providerId: PaymentProviderId) {
    const definition = PAYMENT_PROVIDER_DEFINITIONS.find((item) => item.id === providerId);
    if (!definition) throw new Error(`Unsupported payment provider: ${providerId}`);
    return definition;
}

export function hasPaymentProductionSecret(value: string | undefined) {
    const text = value?.trim() || "";
    return Boolean(text && !/replace-with|change-me|your-|example|local-dev/i.test(text));
}

async function readStoredPaymentConfig(): Promise<unknown> {
    if (isPostgresDatabaseEnabled() && getPostgresConnectionString()) {
        await ensurePostgresSchema();
        return createPostgresRepositories().settings.getPaymentConfig();
    }
    return readJsonDataFile<unknown>(PAYMENT_CONFIG_FILE, {});
}

function invalidatePaymentRuntimeCache() {
    paymentRuntimeGeneration += 1;
    paymentRuntimeCache = undefined;
    paymentRuntimePromise = undefined;
}

async function writeStoredPaymentConfig(value: SavedPaymentConfig) {
    if (isPostgresDatabaseEnabled() && getPostgresConnectionString()) {
        await ensurePostgresSchema();
        await createPostgresRepositories().settings.updateSettings({ paymentConfig: value as unknown as JsonValue });
        return;
    }
    await writeJsonDataFile(PAYMENT_CONFIG_FILE, value);
}

function normalizeSavedPaymentConfig(value: unknown): SavedPaymentConfig {
    const source = value && typeof value === "object" && !Array.isArray(value) ? (value as { providers?: unknown }) : {};
    const providersInput = source.providers && typeof source.providers === "object" && !Array.isArray(source.providers) ? (source.providers as Record<string, unknown>) : {};
    const providers: SavedPaymentConfig["providers"] = {};
    for (const definition of PAYMENT_PROVIDER_DEFINITIONS) {
        const raw = providersInput[definition.id];
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
        providers[definition.id] = normalizeSavedProviderConfig(raw as Partial<SavedPaymentProviderConfig>, definition.fields, definition.id);
    }
    return { providers };
}

function normalizeSavedProviderConfig(value: Partial<SavedPaymentProviderConfig>, fields: PaymentProviderConfigField[], providerId: PaymentProviderId): SavedPaymentProviderConfig {
    const sourceValues = value.values && typeof value.values === "object" && !Array.isArray(value.values) ? value.values : {};
    const values: Record<string, string> = {};
    for (const field of fields) {
        values[field.key] = normalizePaymentConfigText(sourceValues[field.key], field.kind === "textarea" ? 20_000 : 2_000);
    }
    return {
        enabled: providerId === "manual" ? true : value.enabled === true,
        values,
    };
}

function encryptPaymentConfigSecrets(config: SavedPaymentConfig): SavedPaymentConfig {
    return transformPaymentConfigSecrets(config, encryptSecretValue);
}

function decryptPaymentConfigSecrets(config: SavedPaymentConfig): SavedPaymentConfig {
    return transformPaymentConfigSecrets(config, decryptSecretValue);
}

function transformPaymentConfigSecrets(config: SavedPaymentConfig, transform: (value: string) => string): SavedPaymentConfig {
    const providers: SavedPaymentConfig["providers"] = {};
    for (const definition of PAYMENT_PROVIDER_DEFINITIONS) {
        const provider = config.providers[definition.id];
        if (!provider) continue;
        const values: Record<string, string> = {};
        for (const field of definition.fields) {
            const value = provider.values[field.key] || "";
            values[field.key] = field.secret ? transform(value) : value;
        }
        providers[definition.id] = { ...provider, values };
    }
    return { providers };
}

function normalizePaymentConfigText(value: unknown, maxLength: number) {
    const text = typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
    return text.slice(0, maxLength);
}

function normalizePaymentProviderId(value: string): PaymentProviderId | undefined {
    const provider = value.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (provider === "stripe") return "stripe";
    if (provider === "alipay" || provider === "ali") return "alipay";
    if (provider === "wechat" || provider === "wxpay" || provider === "wechatpay" || provider === "weixin") return "wechat";
    if (provider === "payply") return "payply";
    if (provider === "manual" || provider === "custom") return "manual";
    return undefined;
}
