import type { LogicalModelCapability } from "@/lib/auth/store";

export type ChannelRuntimeHealth = {
    channelId: string;
    capability: LogicalModelCapability;
    consecutiveFailures: number;
    cooldownUntil?: number;
    lastFailureAt?: number;
    lastSuccessAt?: number;
    lastError?: string;
};

type RuntimeCandidate = { channelId: string };

const FAILURE_THRESHOLD = 3;
const BASE_COOLDOWN_MS = 30_000;
const MAX_COOLDOWN_MS = 5 * 60_000;
const states = new Map<string, ChannelRuntimeHealth>();

export function recordChannelRuntimeSuccess(channelId: string | undefined, capability: LogicalModelCapability, now = Date.now()) {
    if (!channelId) return;
    const key = stateKey(channelId, capability);
    const current = states.get(key);
    states.set(key, { channelId, capability, consecutiveFailures: 0, lastSuccessAt: now, lastError: undefined, cooldownUntil: undefined, lastFailureAt: current?.lastFailureAt });
}

export function recordChannelRuntimeFailure(channelId: string | undefined, capability: LogicalModelCapability, error: string | undefined, now = Date.now()) {
    if (!channelId || isCancellation(error)) return;
    const key = stateKey(channelId, capability);
    const current = states.get(key);
    const consecutiveFailures = (current?.consecutiveFailures || 0) + 1;
    const cooldownUntil = consecutiveFailures >= FAILURE_THRESHOLD ? now + Math.min(MAX_COOLDOWN_MS, BASE_COOLDOWN_MS * 2 ** Math.max(0, consecutiveFailures - FAILURE_THRESHOLD)) : current?.cooldownUntil;
    states.set(key, { channelId, capability, consecutiveFailures, cooldownUntil, lastFailureAt: now, lastSuccessAt: current?.lastSuccessAt, lastError: safeError(error) });
}

export function getChannelRuntimeHealth(channelId: string | undefined, capability: LogicalModelCapability, now = Date.now()): ChannelRuntimeHealth {
    const current = channelId ? states.get(stateKey(channelId, capability)) : undefined;
    return current ? { ...current, cooldownUntil: current.cooldownUntil && current.cooldownUntil > now ? current.cooldownUntil : undefined } : { channelId: channelId || "", capability, consecutiveFailures: 0 };
}

export function isChannelRuntimeCooling(channelId: string, capability: LogicalModelCapability, now = Date.now()) {
    const state = states.get(stateKey(channelId, capability));
    return Boolean(state?.cooldownUntil && state.cooldownUntil > now);
}

export function filterHealthyRuntimeCandidates<T extends RuntimeCandidate>(candidates: T[], capability: LogicalModelCapability, now = Date.now()) {
    const healthy = candidates.filter((candidate) => !isChannelRuntimeCooling(candidate.channelId, capability, now));
    // A cooldown is a retry hint, not a configuration deletion. Keep the highest-priority
    // candidate available when every route is cooling so callers can retry and report the
    // provider error instead of falsely claiming that no default model exists.
    return healthy.length || !candidates.length ? healthy : candidates.slice(0, 1);
}

export function resetChannelRuntimeHealth() {
    states.clear();
}

function stateKey(channelId: string, capability: LogicalModelCapability) {
    return `${capability}:${channelId}`;
}

function isCancellation(error?: string) {
    return /取消|cancelled|canceled|aborted/i.test(error || "");
}

function safeError(error?: string) {
    return (error || "渠道请求失败").slice(0, 500);
}
