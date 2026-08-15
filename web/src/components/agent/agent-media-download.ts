import { saveAs } from "file-saver";

import { mediaDownloadFileName } from "@/lib/media-file";
import { originalImageDownloadUrl, originalMediaDownloadUrl } from "@/lib/media-image-url";

export type AgentMediaDownload = { type: "image" | "video"; url: string; title: string; mimeType?: string };

export function downloadAgentMedia(items: AgentMediaDownload[]) {
    items.forEach((item, index) => {
        const title = items.length > 1 ? `${item.title}-${index + 1}` : item.title;
        const url = item.type === "image" ? originalImageDownloadUrl(item.url) : originalMediaDownloadUrl(item.url);
        saveAs(url, agentMediaDownloadName(item.type, title, item.url, item.mimeType));
    });
}

export function agentMediaDownloadName(type: AgentMediaDownload["type"], title: string, url: string, mimeType?: string) {
    return mediaDownloadFileName(`${type}:${title}:${url}`, mimeType || (type === "video" ? "video/mp4" : "image/png"), url);
}
