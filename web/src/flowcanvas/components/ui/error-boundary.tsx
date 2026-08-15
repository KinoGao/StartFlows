"use client";

import * as React from "react";

import { Button } from "@/flowcanvas/components/ui/button";
import { cn } from "@/flowcanvas/lib/utils";

type ErrorBoundaryProps = {
    children: React.ReactNode;
    fallback?: (error: Error, reset: () => void) => React.ReactNode;
    onError?: (error: Error, info: React.ErrorInfo) => void;
};

type ErrorBoundaryState = {
    error: Error | null;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        this.props.onError?.(error, info);
        // 仅在浏览器环境下输出到 console（避免 SSR 报错）
        if (typeof console !== "undefined") {
            console.error("[ErrorBoundary]", error, info.componentStack);
        }
    }

    private reset = () => {
        this.setState({ error: null });
    };

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        if (this.props.fallback) return this.props.fallback(error, this.reset);
        return (
            <div
                role="alert"
                className={cn(
                    "flex h-full min-h-[240px] w-full flex-col items-center justify-center gap-3 p-6 text-center",
                )}
            >
                <div className="text-base font-medium text-foreground">画布渲染出现问题</div>
                <div className="max-w-md text-xs text-muted-foreground">{error.message}</div>
                <Button size="sm" variant="outline" onClick={this.reset}>
                    重试
                </Button>
            </div>
        );
    }
}