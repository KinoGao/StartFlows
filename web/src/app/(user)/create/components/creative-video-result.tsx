"use client";

import { Film, LoaderCircle, Maximize2, Pause, Play, RotateCw, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

import type { CreativeAsset, CreativeMessage } from "@/lib/creative-runtime-contract";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { cn } from "@/lib/utils";

import { creativeAssetLayout } from "./creative-asset-layout";
import { CreativeResultSwitcher, useSelectedCreativeResult } from "./creative-result-switcher";
import { creativeVideoPresentation, formatVideoTime } from "./creative-video-presentation";

export function CreativeVideoResult({
    assets,
    message,
    fallbackResolution,
    fallbackRatio,
    renderActions,
}: {
    assets: CreativeAsset[];
    message: CreativeMessage;
    fallbackResolution?: string;
    fallbackRatio?: string;
    renderActions?: (activeAsset: CreativeAsset) => ReactNode;
}) {
    const videos = useMemo(() => assets.filter((asset) => asset.status === "ready" && asset.type === "video" && assetUrl(asset)), [assets]);
    const { selectedResult: activeAsset, selectedIndex, selectResult } = useSelectedCreativeResult(videos);
    const [loadedDimensions, setLoadedDimensions] = useState<Record<string, { width: number; height: number }>>({});
    const presentation = useMemo(() => (activeAsset ? creativeVideoPresentation(message, activeAsset, fallbackResolution, fallbackRatio) : null), [activeAsset, fallbackRatio, fallbackResolution, message]);
    if (!activeAsset || !presentation) return null;

    const sourceDimensions = validDimensions(activeAsset) || loadedDimensions[activeAsset.id] || {};
    const layout = creativeAssetLayout(sourceDimensions, { variant: "video-result", ratio: presentation.ratio || fallbackRatio });
    const mediaWidth = String(layout?.container.width || "520px");
    const resultStyle = { "--creative-result-media-width": mediaWidth } as CSSProperties;

    return (
        <div
            data-testid="creative-video-result"
            data-results-count={videos.length}
            className={cn("grid w-fit max-w-full grid-cols-[minmax(0,1fr)] items-start", videos.length > 1 && "sm:grid-cols-[var(--creative-result-media-width)_auto] sm:gap-x-3")}
            style={resultStyle}
        >
            <div
                data-testid="creative-primary-result"
                data-rendered-width={layout?.width}
                data-rendered-height={layout?.height}
                style={layout?.container}
                className="col-start-1 row-start-1 max-w-full flex-none overflow-hidden rounded-xl border border-[#30343b] bg-black shadow-[0_4px_18px_rgba(15,23,42,0.08)] dark:border-[#3a4049] dark:shadow-black/25"
            >
                <CreativeVideoPlayer
                    key={activeAsset.id}
                    asset={activeAsset}
                    coverUrl={presentation.coverUrl}
                    resolution={presentation.resolution}
                    onDimensions={(width, height) => {
                        if (width <= 0 || height <= 0 || validDimensions(activeAsset)) return;
                        setLoadedDimensions((current) => (current[activeAsset.id]?.width === width && current[activeAsset.id]?.height === height ? current : { ...current, [activeAsset.id]: { width, height } }));
                    }}
                />
            </div>

            {renderActions ? <div className="col-start-1 row-start-2">{renderActions(activeAsset)}</div> : null}

            <CreativeResultSwitcher
                results={videos}
                selectedIndex={selectedIndex}
                width={mediaWidth}
                height={layout?.height || 293}
                thumbnailWidth={112}
                sideThumbnailWidth={88}
                className="col-start-1 row-start-3 sm:col-start-2 sm:row-start-1"
                renderThumbnail={(video, index) => {
                    const item = creativeVideoPresentation(message, video, fallbackResolution, fallbackRatio);
                    const posterUrl = item.coverUrl ? imagePreviewUrl(item.coverUrl, 360) : undefined;
                    return (
                        <span className="relative block size-full bg-black text-white">
                            {posterUrl ? (
                                <img src={posterUrl} alt="" loading="lazy" className="size-full object-cover" />
                            ) : (
                                <span className="grid size-full place-items-center text-white/70" aria-label={video.title || `生成视频 ${index + 1}`}>
                                    <Film className="size-5" />
                                </span>
                            )}
                            <span className="absolute inset-0 grid place-items-center bg-black/10" aria-hidden>
                                <span className="grid size-7 place-items-center rounded-full bg-black/55">
                                    <Play className="ml-0.5 size-3.5 fill-current" />
                                </span>
                            </span>
                            {video.durationMs ? <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1 py-0.5 text-[9px] font-medium tabular-nums">{formatVideoTime(video.durationMs / 1000)}</span> : null}
                        </span>
                    );
                }}
                onSelect={selectResult}
            />
        </div>
    );
}

function CreativeVideoPlayer({ asset, coverUrl, resolution, onDimensions }: { asset: CreativeAsset; coverUrl?: string; resolution?: string; onDimensions: (width: number, height: number) => void }) {
    const playback = useVideoPlayback(asset);
    const posterUrl = coverUrl ? imagePreviewUrl(coverUrl, 1440) : undefined;
    return (
        <div
            ref={playback.playerRef}
            data-testid="creative-video-player"
            className="group/player relative size-full overflow-hidden bg-black text-white outline-none [container-type:inline-size] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#817cff]"
            tabIndex={0}
            onKeyDown={playback.handleKeyboard}
        >
            <video
                ref={playback.videoRef}
                src={assetUrl(asset)}
                poster={posterUrl}
                muted={playback.muted}
                playsInline
                preload="metadata"
                className="size-full cursor-pointer object-contain"
                aria-label={asset.title || "生成视频"}
                onClick={() => void playback.togglePlayback()}
                onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    const duration = Number(video.duration);
                    if (Number.isFinite(duration) && duration > 0) playback.setDuration(duration);
                    onDimensions(video.videoWidth, video.videoHeight);
                    playback.setLoading(false);
                }}
                onCanPlay={() => playback.setLoading(false)}
                onTimeUpdate={(event) => playback.setCurrentTime(event.currentTarget.currentTime)}
                onPlay={() => playback.setPlaying(true)}
                onPause={() => playback.setPlaying(false)}
                onEnded={() => playback.setPlaying(false)}
                onError={() => {
                    playback.setLoading(false);
                    playback.setFailed(true);
                }}
            />
            {playback.loading && !playback.failed ? (
                <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/10" aria-label="正在加载视频">
                    <LoaderCircle className="size-5 animate-spin text-white/85" />
                </span>
            ) : null}
            {!playback.loading && !playback.playing && !playback.failed ? (
                <button
                    type="button"
                    className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/55 bg-black/40 text-white backdrop-blur-[4px] transition-colors hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/75 sm:size-16"
                    onClick={() => void playback.togglePlayback()}
                    aria-label="开始播放视频"
                >
                    <Play className="ml-1 size-6 fill-current sm:size-7" />
                </button>
            ) : null}
            {playback.failed ? <VideoFailure playback={playback} /> : null}
            <VideoControls resolution={resolution} playback={playback} />
        </div>
    );
}

function useVideoPlayback(asset: CreativeAsset) {
    const playerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const fallbackDuration = Math.max(0, Number(asset.durationMs || 0) / 1000);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(fallbackDuration);
    const [playing, setPlaying] = useState(false);
    const [muted, setMuted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const safeDuration = duration || fallbackDuration;
    const progress = safeDuration > 0 ? Math.min(100, Math.max(0, (currentTime / safeDuration) * 100)) : 0;

    useEffect(() => {
        const video = videoRef.current;
        return () => video?.pause();
    }, [asset.id]);

    const togglePlayback = async () => {
        const video = videoRef.current;
        if (!video || failed) return;
        if (!video.paused) return video.pause();
        try {
            await video.play();
        } catch {
            setFailed(true);
        }
    };
    const seekTo = (value: number) => {
        const video = videoRef.current;
        if (!video) return;
        const next = Math.min(safeDuration || value, Math.max(0, value));
        video.currentTime = next;
        setCurrentTime(next);
    };
    const toggleFullscreen = async () => {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await playerRef.current?.requestFullscreen();
    };
    const handleKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable) return;
        const key = event.key.toLowerCase();
        if (key === " " || key === "spacebar") {
            event.preventDefault();
            void togglePlayback();
        } else if (key === "arrowleft") seekTo(currentTime - 5);
        else if (key === "arrowright") seekTo(currentTime + 5);
        else if (key === "m") setMuted((value) => !value);
        else if (key === "f") void toggleFullscreen();
    };
    return {
        playerRef,
        videoRef,
        currentTime,
        safeDuration,
        progress,
        playing,
        muted,
        loading,
        failed,
        setCurrentTime,
        setDuration,
        setPlaying,
        setMuted,
        setLoading,
        setFailed,
        togglePlayback,
        seekTo,
        toggleFullscreen,
        handleKeyboard,
    };
}

type VideoPlayback = ReturnType<typeof useVideoPlayback>;

function VideoFailure({ playback }: { playback: VideoPlayback }) {
    return (
        <div className="absolute inset-0 z-10 grid place-items-center bg-black/70 px-4 text-center">
            <div>
                <p className="text-sm font-medium">视频加载失败</p>
                <button
                    type="button"
                    className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/35 px-3 text-xs font-medium text-white transition-colors hover:bg-white/10"
                    onClick={() => {
                        playback.setFailed(false);
                        playback.setLoading(true);
                        playback.videoRef.current?.load();
                    }}
                >
                    <RotateCw className="size-3.5" /> 重试
                </button>
            </div>
        </div>
    );
}

function VideoControls({ resolution, playback }: { resolution?: string; playback: VideoPlayback }) {
    return (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-b from-transparent via-black/35 to-black/75 px-2.5 pb-2.5 pt-8 text-white sm:gap-2 sm:px-3 sm:pb-3">
            <button type="button" className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-white/10" onClick={() => void playback.togglePlayback()} aria-label={playback.playing ? "暂停视频" : "播放视频"}>
                {playback.playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
            </button>
            <span className="shrink-0 text-[10px] font-medium tabular-nums text-white/95 sm:text-[11px]">
                {formatVideoTime(playback.currentTime)} / {formatVideoTime(playback.safeDuration)}
            </span>
            <input
                type="range"
                min={0}
                max={Math.max(playback.safeDuration, 0.01)}
                step={0.01}
                value={Math.min(playback.currentTime, Math.max(playback.safeDuration, 0.01))}
                onChange={(event) => playback.seekTo(Number(event.currentTarget.value))}
                aria-label="视频播放进度"
                className="h-1 min-w-8 flex-1 cursor-pointer appearance-none rounded-full bg-white/30 [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                style={{ background: `linear-gradient(90deg, #ffffff 0%, #ffffff ${playback.progress}%, rgba(255,255,255,.3) ${playback.progress}%, rgba(255,255,255,.3) 100%)` }}
            />
            {resolution ? <span className="hidden shrink-0 text-[11px] font-semibold @min-[280px]:inline">{resolution}</span> : null}
            <button type="button" className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-white/10" onClick={() => playback.setMuted((value) => !value)} aria-label={playback.muted ? "打开声音" : "静音"}>
                {playback.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
            <button type="button" className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-white/10" onClick={() => void playback.toggleFullscreen()} aria-label="全屏播放">
                <Maximize2 className="size-4" />
            </button>
        </div>
    );
}

function validDimensions(asset: Pick<CreativeAsset, "width" | "height">) {
    const width = Number(asset.width);
    const height = Number(asset.height);
    return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : undefined;
}

function assetUrl(asset: CreativeAsset) {
    return asset.serverUrl || asset.remoteUrl || "";
}
