"use client";

import { resolveMediaUrl } from "@/flowcanvas/services/file-storage";
import { resolveImageThumbnailUrl, uploadImage } from "@/flowcanvas/services/image-storage";

import type { CanvasProject } from "../stores/use-canvas-store";
import { CanvasNodeType } from "../types";

/**
 * 进入画布前预加载媒体内容：
 * - 图片节点：下载并解码缩略图（进入动画等待的是内容真正就绪，而不是只解析 URL；
 *   画布页随后加载同一缩略图 URL，直接命中浏览器缓存）
 * - data:image 图片节点：uploadImage 转存（带 dataUrl 缓存，画布页恢复时不会重复上传）
 * - 视频 / 音频：只预热签名 URL（媒体流式加载，不整段下载）
 * - 助手会话引用同步预热
 * 单项失败不抛出（组件渲染时降级显示占位），返回成功 / 失败统计。
 */
export async function preloadCanvasMedia(project: CanvasProject): Promise<{ resolved: number; failed: number }> {
    const tasks: Promise<unknown>[] = [];
    for (const node of project.nodes) {
        const content = node.metadata?.content;
        if (node.type === CanvasNodeType.Image) {
            if (content?.startsWith("data:image/")) {
                tasks.push(uploadImage(content));
            } else if (node.metadata?.storageKey) {
                tasks.push(
                    resolveImageThumbnailUrl(node.metadata.storageKey, "")
                        .then((url) => downloadImageBytes(url))
                        .catch(() => undefined),
                );
            }
        } else if ((node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) && node.metadata?.storageKey) {
            tasks.push(resolveMediaUrl(node.metadata.storageKey, ""));
        }
    }
    for (const session of project.chatSessions || []) {
        for (const message of session.messages) {
            for (const ref of message.references || []) {
                if (!ref.storageKey) continue;
                tasks.push(ref.type === CanvasNodeType.Video ? resolveMediaUrl(ref.storageKey, "") : resolveImageThumbnailUrl(ref.storageKey, ""));
            }
        }
    }
    const results = await Promise.allSettled(tasks);
    return {
        resolved: results.filter((result) => result.status === "fulfilled").length,
        failed: results.filter((result) => result.status === "rejected").length,
    };
}

/** 下载并解码图片字节：完成后浏览器缓存可命中，画布页随后加载同一缩略图 URL 无需再次等待。 */
function downloadImageBytes(url: string) {
    if (!url) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
        const image = new Image();
        const timer = window.setTimeout(() => {
            image.src = "";
            reject(new Error("图片加载超时"));
        }, 15000);
        image.onload = () => {
            window.clearTimeout(timer);
            resolve();
        };
        image.onerror = () => {
            window.clearTimeout(timer);
            reject(new Error("图片加载失败"));
        };
        image.src = url;
    });
}
