"use client";

import { useParams as useNextParams, useRouter } from "next/navigation";

/** react-router 的 useNavigate 兼容层（Next App Router）。 */
export function useNavigate() {
    const router = useRouter();
    return (to: string, options?: { replace?: boolean }) => (options?.replace ? router.replace(to) : router.push(to));
}

/** react-router 的 useParams 兼容层：动态段数组值取第一项。 */
export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
    const params = useNextParams();
    const flat = Object.fromEntries(Object.entries(params ?? {}).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
    return flat as T;
}
