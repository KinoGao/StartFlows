import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

import { resolveServerProxyUrl } from "@/lib/server/proxy-dispatcher";

const BLOCKED_HOSTNAMES = ["metadata.google.internal", "metadata.goog", "metadata.azure.com", "instance-data"];
const NON_PUBLIC_IPV4_ADDRESSES = addressBlockList([
    ["0.0.0.0", 8, "ipv4"],
    ["10.0.0.0", 8, "ipv4"],
    ["100.64.0.0", 10, "ipv4"],
    ["127.0.0.0", 8, "ipv4"],
    ["169.254.0.0", 16, "ipv4"],
    ["172.16.0.0", 12, "ipv4"],
    ["192.0.0.0", 24, "ipv4"],
    ["192.0.2.0", 24, "ipv4"],
    ["192.88.99.0", 24, "ipv4"],
    ["192.168.0.0", 16, "ipv4"],
    ["198.18.0.0", 15, "ipv4"],
    ["198.51.100.0", 24, "ipv4"],
    ["203.0.113.0", 24, "ipv4"],
    ["224.0.0.0", 4, "ipv4"],
    ["240.0.0.0", 4, "ipv4"],
]);
const NON_PUBLIC_IPV6_ADDRESSES = addressBlockList([
    ["::", 96, "ipv6"],
    ["::ffff:0:0", 96, "ipv6"],
    ["64:ff9b::", 96, "ipv6"],
    ["64:ff9b:1::", 48, "ipv6"],
    ["100::", 64, "ipv6"],
    ["2001::", 23, "ipv6"],
    ["2001:db8::", 32, "ipv6"],
    ["2002::", 16, "ipv6"],
    ["fc00::", 7, "ipv6"],
    ["fe80::", 10, "ipv6"],
    ["fec0::", 10, "ipv6"],
    ["ff00::", 8, "ipv6"],
]);
const PRIVATE_ALLOWLISTABLE_IPV4_ADDRESSES = addressBlockList([
    ["10.0.0.0", 8, "ipv4"],
    ["100.64.0.0", 10, "ipv4"],
    ["127.0.0.0", 8, "ipv4"],
    ["172.16.0.0", 12, "ipv4"],
    ["192.168.0.0", 16, "ipv4"],
]);
const PRIVATE_ALLOWLISTABLE_IPV6_ADDRESSES = addressBlockList([
    ["::1", 128, "ipv6"],
    ["fc00::", 7, "ipv6"],
    ["fec0::", 10, "ipv6"],
]);
// RFC 2544 基准测试段永不可路由，本地 DNS 返回该段即代理工具的 fake-ip 应答（Clash 默认池）
const FAKE_IP_IPV4_ADDRESSES = addressBlockList([["198.18.0.0", 15, "ipv4"]]);

export type SafeOutboundTarget = {
    url: URL;
    address: string;
    family: 4 | 6;
};

export async function resolveSafeOutboundTarget(value: string | URL, options?: { allowCredentials?: boolean }): Promise<SafeOutboundTarget | null> {
    const parsed = parseOutboundUrl(value, options);
    if (!parsed) return null;
    const { url, hostname } = parsed;
    const privateAllowed = privateUpstreamHostAllowed(hostname);
    if ((hostname === "localhost" || hostname.endsWith(".localhost")) && !privateAllowed) return null;
    const directFamily = isIP(hostname);
    if (directFamily) return addressAllowed(hostname, privateAllowed) ? { url, address: hostname, family: directFamily as 4 | 6 } : null;

    try {
        const addresses = dedupeAddresses(await lookup(hostname, { all: true, verbatim: true }));
        if (!addresses.length || !addresses.every((item) => addressAllowed(item.address, privateAllowed))) return null;
        return { url, address: addresses[0].address, family: addresses[0].family as 4 | 6 };
    } catch {
        return null;
    }
}

export async function isSafeOutboundUrl(value: string, options?: { allowCredentials?: boolean }) {
    if (await resolveSafeOutboundTarget(value, options)) return true;
    // fake-ip DNS 下本地只能解析到保留地址；配置了系统代理时由代理服务器解析真实 DNS
    return Boolean(resolveServerProxyUrl()) && (await hasFakeIpOnlyResolution(value, options));
}

// fake-ip 模式（Clash 等）会把所有域名解析到 198.18.0.0/15 保留段，本地无法钉住真实 IP；
// 仅在全部应答均非公网且带有 fake-ip 标记时认定为可识别的 fake-ip 场景，真实内网应答依旧拒绝。
export async function hasFakeIpOnlyResolution(value: string | URL, options?: { allowCredentials?: boolean }): Promise<boolean> {
    const parsed = parseOutboundUrl(value, options);
    if (!parsed) return false;
    const { hostname } = parsed;
    if (hostname === "localhost" || hostname.endsWith(".localhost")) return false;
    if (isIP(hostname)) return false;
    try {
        const addresses = dedupeAddresses(await lookup(hostname, { all: true, verbatim: true }));
        if (!addresses.length || addresses.some((item) => isPublicIpAddress(item.address))) return false;
        return addresses.some((item) => item.family === 4 && FAKE_IP_IPV4_ADDRESSES.check(item.address, "ipv4"));
    } catch {
        return false;
    }
}

function parseOutboundUrl(value: string | URL, options?: { allowCredentials?: boolean }) {
    let url: URL;
    try {
        url = value instanceof URL ? new URL(value) : new URL(value);
    } catch {
        return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!options?.allowCredentials && (url.username || url.password)) return null;
    const hostname = normalizeHostname(url.hostname);
    if (!hostname || isBlockedHostname(hostname)) return null;
    return { url, hostname };
}

export function isPublicIpAddress(address: string) {
    const version = isIP(address);
    if (!version) return false;
    const mapped = mappedIpv4(address);
    if (mapped) return isPublicIpAddress(mapped);
    return !addressBlockListContains(address, version, NON_PUBLIC_IPV4_ADDRESSES, NON_PUBLIC_IPV6_ADDRESSES);
}

function addressAllowed(address: string, privateAllowed: boolean) {
    return isPublicIpAddress(address) || (privateAllowed && isPrivateAllowlistableAddress(address));
}

function isPrivateAllowlistableAddress(address: string) {
    const version = isIP(address);
    if (!version) return false;
    const mapped = mappedIpv4(address);
    if (mapped) return isPrivateAllowlistableAddress(mapped);
    return addressBlockListContains(address, version, PRIVATE_ALLOWLISTABLE_IPV4_ADDRESSES, PRIVATE_ALLOWLISTABLE_IPV6_ADDRESSES);
}

function addressBlockListContains(address: string, version: number, ipv4: BlockList, ipv6: BlockList) {
    return version === 4 ? ipv4.check(address, "ipv4") : ipv6.check(address, "ipv6");
}

function privateUpstreamHostAllowed(hostname: string) {
    if (process.env.VOZEB_PRO_ALLOW_PRIVATE_UPSTREAMS !== "1") return false;
    return (process.env.VOZEB_PRO_PRIVATE_UPSTREAM_HOSTS || "").split(",").map(normalizeHostname).filter(Boolean).includes(hostname);
}

function isBlockedHostname(hostname: string) {
    return BLOCKED_HOSTNAMES.some((blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`) || hostname.includes(blocked));
}

function normalizeHostname(value: string) {
    return value
        .trim()
        .replace(/^\[|\]$/g, "")
        .toLowerCase();
}

function dedupeAddresses(addresses: Array<{ address: string; family: number }>) {
    const seen = new Set<string>();
    return addresses.filter((item): item is { address: string; family: 4 | 6 } => {
        if ((item.family !== 4 && item.family !== 6) || !isIP(item.address)) return false;
        const key = `${item.family}:${item.address.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function addressBlockList(entries: Array<[string, number, "ipv4" | "ipv6"]>) {
    const list = new BlockList();
    entries.forEach(([network, prefix, family]) => list.addSubnet(network, prefix, family));
    return list;
}

function mappedIpv4(address: string) {
    const match = address.toLowerCase().match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    return match?.[1] && isIP(match[1]) === 4 ? match[1] : "";
}
