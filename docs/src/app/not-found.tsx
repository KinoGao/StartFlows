import type { Metadata } from "next";
import Link from "next/link";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";

export default function NotFound() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <h1 className="text-6xl font-bold text-fd-foreground">404</h1>
        <p className="mt-4 text-xl text-fd-muted-foreground">页面未找到</p>
        <p className="mt-2 text-sm text-fd-muted-foreground">
          抱歉，您访问的页面不存在或已被移除。
        </p>
        <div className="mt-8 flex gap-4">
          <Link
            href="/"
            className="rounded-lg bg-fd-primary px-6 py-2.5 text-sm font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
          >
            返回首页
          </Link>
          <Link
            href="/docs"
            className="rounded-lg border border-fd-border px-6 py-2.5 text-sm font-medium transition-colors hover:bg-fd-accent"
          >
            查看文档
          </Link>
        </div>
      </div>
    </HomeLayout>
  );
}

export const metadata: Metadata = {
  title: "404 - 页面未找到",
  description: "您访问的页面不存在",
};
