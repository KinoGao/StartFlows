import { NextResponse } from "next/server";

import { isBillingInputError } from "@/lib/server/billing-service";

export function commerceOk<T>(data: T, status = 200) {
    return NextResponse.json({ code: 0, data, msg: "" }, { status });
}

export function commerceError(error: unknown, fallback: string, event: string) {
    if (isBillingInputError(error)) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
    console.error(event, error);
    return NextResponse.json({ code: 500, data: null, msg: fallback }, { status: 500 });
}
