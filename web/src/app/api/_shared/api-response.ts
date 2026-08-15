import { NextResponse } from "next/server";

export type ApiResponseBody<T> = {
    code: number;
    data: T;
    msg: string;
};

export function apiSuccess<T>(data: T, msg = "OK", init?: ResponseInit) {
    return NextResponse.json<ApiResponseBody<T>>({ code: 0, data, msg }, init);
}

export function apiError(status: number, msg: string, init?: Omit<ResponseInit, "status">) {
    return NextResponse.json<ApiResponseBody<null>>({ code: status, data: null, msg }, { ...init, status });
}

export function apiCompatError(status: number, msg: string, init?: Omit<ResponseInit, "status">) {
    return NextResponse.json<ApiResponseBody<null> & { error: string }>({ code: status, data: null, msg, error: msg }, { ...init, status });
}
