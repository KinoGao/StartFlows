import { useEffect, useState } from "react";

import type { CanvasSessionPricing } from "../utils/canvas-points-estimate";

let cached: CanvasSessionPricing | null | undefined;
let inflight: Promise<CanvasSessionPricing | null> | null = null;

function loadSessionPricing(): Promise<CanvasSessionPricing | null> {
    if (cached !== undefined) return Promise.resolve(cached);
    if (!inflight) {
        inflight = fetch("/api/auth/session")
            .then((res) => res.json())
            .then((body) => {
                const data = body?.data;
                // 响应正常但缺少计价字段视为合法空态，可直接缓存；网络/接口异常不缓存，下次消费时重试
                cached = data?.modelPointCosts && data?.generationPointMultipliers ? { modelPointCosts: data.modelPointCosts, generationPointMultipliers: data.generationPointMultipliers } : null;
                return cached;
            })
            .catch(() => {
                inflight = null;
                return null;
            });
    }
    return inflight;
}

/** 公开 session 的模型计价（modelPointCosts + 参数倍率），模块级缓存，全画布共享一次请求。 */
export function useSessionPricing(): CanvasSessionPricing | null {
    const [pricing, setPricing] = useState<CanvasSessionPricing | null>(cached ?? null);
    useEffect(() => {
        let mounted = true;
        void loadSessionPricing().then((value) => {
            if (mounted) setPricing(value);
        });
        return () => {
            mounted = false;
        };
    }, []);
    return pricing;
}
