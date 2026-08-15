"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal, Slider, theme as antdTheme } from "antd";
import { Check, Music2, Pause, Play, Trash2, Volume2, VolumeX, X } from "lucide-react";

import { formatTrimTime, VIDEO_TRIM_MIN_SECONDS } from "../utils/canvas-video-tools";
import {
    adjustClipOutPoint,
    clipEffectiveDuration,
    createTimelineClip,
    isTimelineEditableTarget,
    layoutTimeline,
    locateTimelineTime,
    moveTimelineClip,
    removeTimelineClip,
    resolveTimelineShortcut,
    setClipPointFromPlayhead,
    updateClipRange,
    withClipDuration,
    type TimelineClip,
    type TimelineShortcutAction,
} from "../utils/canvas-video-timeline";

export type CompositionSource = { id: string; kind: "video" | "audio"; title: string; src: string };

/** 时间轴上每秒对应的像素宽度 */
const TIMELINE_PIXELS_PER_SECOND = 28;

export function CanvasVideoCompositionDialog({ open, sources, onClose, onExport }: { open: boolean; sources: CompositionSource[]; onClose: () => void; onExport: (videoClips: TimelineClip[], audioClips: TimelineClip[]) => void }) {
    const { token } = antdTheme.useToken();
    const [videoClips, setVideoClips] = useState<TimelineClip[]>([]);
    const [audioClips, setAudioClips] = useState<TimelineClip[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [playhead, setPlayhead] = useState(0);
    const [playing, setPlaying] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRefs = useRef(new Map<string, HTMLAudioElement>());
    const rafRef = useRef(0);
    const currentClipIdRef = useRef<string | null>(null);
    const playingRef = useRef(false);
    const playheadRef = useRef(0);
    const videoClipsRef = useRef(videoClips);
    videoClipsRef.current = videoClips;
    const audioClipsRef = useRef(audioClips);
    audioClipsRef.current = audioClips;
    const selectedIdRef = useRef(selectedId);
    selectedIdRef.current = selectedId;

    const layout = useMemo(() => layoutTimeline(videoClips), [videoClips]);
    const layoutRef = useRef(layout);
    layoutRef.current = layout;
    const audioLayout = useMemo(() => layoutTimeline(audioClips), [audioClips]);
    const audioLayoutRef = useRef(audioLayout);
    audioLayoutRef.current = audioLayout;
    const layoutSignature = layout.items.map((item) => `${item.clip.id}:${item.start}:${item.end}`).join("|") + `|${layout.totalDuration}`;

    const updatePlayhead = useCallback((time: number) => {
        // 容差比较：拖动/播放的浮点值微小抖动不触发 setState，避免受控 Slider 校正死循环。
        if (Math.abs(playheadRef.current - time) < 0.001) return;
        playheadRef.current = time;
        setPlayhead(time);
    }, []);

    const stopPlayback = useCallback(() => {
        playingRef.current = false;
        setPlaying(false);
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = 0;
        }
        videoRef.current?.pause();
        audioRefs.current.forEach((audio) => audio.pause());
    }, []);

    const loadClip = useCallback((clip: TimelineClip, sourceTime: number, autoplay: boolean) => {
        const video = videoRef.current;
        if (!video) return;
        if (currentClipIdRef.current !== clip.id) {
            video.src = clip.src;
            currentClipIdRef.current = clip.id;
        }
        if (Math.abs(video.currentTime - sourceTime) > 0.001) video.currentTime = sourceTime;
        if (autoplay) void video.play().catch(() => {});
        else video.pause();
    }, []);

    /** 把全局播放头同步到预览视频（切换片段并对齐素材本地时间）。 */
    const applyPlayhead = useCallback(
        (time: number, autoplay = playingRef.current) => {
            const { totalDuration } = layoutRef.current;
            const clamped = Math.min(Math.max(time, 0), totalDuration);
            updatePlayhead(clamped);
            const position = locateTimelineTime(layoutRef.current, clamped);
            if (!position) {
                currentClipIdRef.current = null;
                return;
            }
            loadClip(position.item.clip, position.sourceTime, autoplay && clamped < totalDuration && position.sourceTime < position.item.clip.outPoint);
        },
        [loadClip, updatePlayhead],
    );

    /** 播放循环：预览视频推进播放头，到达片段出点切换下一片段，同时同步音频轨。 */
    const syncAudioByNodeId = useCallback((globalTime: number) => {
        audioLayoutRef.current.items.forEach((item) => {
            const audio = audioRefs.current.get(item.clip.id);
            if (!audio) return;
            const within = globalTime >= item.start && globalTime < item.end && !item.clip.muted;
            if (!within) {
                if (!audio.paused) audio.pause();
                return;
            }
            const expected = item.clip.inPoint + (globalTime - item.start);
            if (audio.paused || Math.abs(audio.currentTime - expected) > 0.35) audio.currentTime = expected;
            if (audio.paused) audio.play().catch(() => {});
        });
    }, []);

    const tick = useCallback(() => {
        if (!playingRef.current) return;
        const video = videoRef.current;
        const { items, totalDuration } = layoutRef.current;
        const item = items.find((entry) => entry.clip.id === currentClipIdRef.current);
        if (video && item) {
            if (video.currentTime >= item.clip.outPoint - 0.02 || video.ended) {
                const nextIndex = items.indexOf(item) + 1;
                if (nextIndex >= items.length) {
                    updatePlayhead(totalDuration);
                    stopPlayback();
                    return;
                }
                const next = items[nextIndex];
                loadClip(next.clip, next.clip.inPoint, true);
                updatePlayhead(next.start);
                syncAudioByNodeId(next.start);
            } else {
                const globalTime = Math.min(totalDuration, item.start + Math.max(0, video.currentTime - item.clip.inPoint));
                updatePlayhead(globalTime);
                syncAudioByNodeId(globalTime);
            }
        }
        rafRef.current = requestAnimationFrame(tick);
    }, [loadClip, stopPlayback, syncAudioByNodeId, updatePlayhead]);

    const togglePlay = useCallback(() => {
        if (playingRef.current) {
            stopPlayback();
            return;
        }
        if (!layoutRef.current.items.some((item) => item.end > item.start)) return;
        if (playheadRef.current >= layoutRef.current.totalDuration - 0.01) updatePlayhead(0);
        playingRef.current = true;
        setPlaying(true);
        applyPlayhead(playheadRef.current, true);
        rafRef.current = requestAnimationFrame(tick);
    }, [applyPlayhead, stopPlayback, tick, updatePlayhead]);

    // 打开时按连入素材重建时间轴
    useEffect(() => {
        if (!open) return;
        stopPlayback();
        setVideoClips(sources.filter((source) => source.kind === "video").map(createTimelineClip));
        setAudioClips(sources.filter((source) => source.kind === "audio").map(createTimelineClip));
        setSelectedId(null);
        updatePlayhead(0);
        currentClipIdRef.current = null;
    }, [open, sources, stopPlayback, updatePlayhead]);

    // 关闭时停止播放
    useEffect(() => {
        if (!open) stopPlayback();
    }, [open, stopPlayback]);

    // 当前片段被删除或时间轴重建后，重新定位预览
    useEffect(() => {
        if (!open) return;
        const items = layout.items.filter((item) => item.end > item.start);
        if (!items.length) {
            currentClipIdRef.current = null;
            return;
        }
        if (!items.some((item) => item.clip.id === currentClipIdRef.current)) applyPlayhead(playheadRef.current, false);
    }, [layoutSignature, open, applyPlayhead]);

    // 快捷键：空格播放/暂停、Delete 删除、I/O 出入点、←/→ 移动播放头、↑/↓（Shift 精调）调整片段长度
    useEffect(() => {
        if (!open) return;
        const handleShortcut = (action: TimelineShortcutAction) => {
            if (action.type === "toggle-play") {
                // 焦点在按钮上时空格会触发按钮点击，先失焦再切换播放
                const active = document.activeElement;
                if (active instanceof HTMLElement && active.tagName === "BUTTON") active.blur();
                togglePlay();
                return;
            }
            if (action.type === "seek") {
                applyPlayhead(playheadRef.current + action.deltaSeconds);
                return;
            }
            const selected = selectedIdRef.current;
            if (!selected) return;
            if (action.type === "delete-selected") {
                stopPlayback();
                setVideoClips((current) => removeTimelineClip(current, selected));
                setAudioClips((current) => removeTimelineClip(current, selected));
                setSelectedId(null);
                currentClipIdRef.current = null;
                return;
            }
            const clip = videoClipsRef.current.find((item) => item.id === selected);
            if (!clip || !clip.duration) return;
            if (action.type === "adjust-length") {
                setVideoClips((current) => current.map((item) => (item.id === selected ? adjustClipOutPoint(item, action.deltaSeconds) : item)));
                return;
            }
            const layoutItem = layoutTimeline(videoClipsRef.current).items.find((item) => item.clip.id === selected);
            if (!layoutItem) return;
            setVideoClips((current) => current.map((item) => (item.id === selected ? setClipPointFromPlayhead(item, layoutItem.start, playheadRef.current, action.point) : item)));
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (isTimelineEditableTarget(event.target as HTMLElement | null)) return;
            const action = resolveTimelineShortcut(event);
            if (!action) return;
            event.preventDefault();
            handleShortcut(action);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, applyPlayhead, stopPlayback, togglePlay]);

    // 出入点 / 长度调整后保持预览与播放头一致
    useEffect(() => {
        if (!open || playingRef.current) return;
        applyPlayhead(playheadRef.current, false);
    }, [layoutSignature, open, applyPlayhead]);

    const selectedVideoItem = layout.items.find((item) => item.clip.id === selectedId && item.clip.duration);
    const canExport = videoClips.some((clip) => clipEffectiveDuration(clip) >= VIDEO_TRIM_MIN_SECONDS) && layout.totalDuration > 0;

    const clipBlockWidth = (seconds: number) => Math.max(72, Math.round(seconds * TIMELINE_PIXELS_PER_SECOND));

    return (
        <Modal title="视频合成 · 时间轴" open={open} onCancel={onClose} footer={null} width={960} centered destroyOnHidden>
            <div className="space-y-4">
                <div className="flex justify-center">
                    <video ref={videoRef} playsInline className="max-h-[40vh] max-w-full rounded-lg bg-black" />
                </div>

                <div className="flex items-center gap-3">
                    <Button size="small" icon={playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} onClick={togglePlay} disabled={!layout.totalDuration}>
                        {playing ? "暂停" : "播放"}
                    </Button>
                    <Slider
                        className="flex-1"
                        min={0}
                        max={Math.max(layout.totalDuration, 0.01)}
                        step={0.05}
                        value={Math.min(playhead, layout.totalDuration)}
                        onChange={(value) => {
                            // 拖动播放头：与当前值一致时不重复 setState，避免受控循环。
                            if (Math.abs(value - playheadRef.current) < 0.001) return;
                            applyPlayhead(value);
                        }}
                        tooltip={{ formatter: (value) => formatTrimTime(value ?? 0) }}
                    />
                    <span className="shrink-0 text-xs tabular-nums opacity-70">
                        {formatTrimTime(playhead)} / {formatTrimTime(layout.totalDuration)}
                    </span>
                </div>

                <div className="space-y-1.5">
                    <div className="text-xs opacity-60">视频轨（{videoClips.length} 个片段，可拖拽排序，点击选中后裁剪）</div>
                    <div className="thin-scrollbar flex min-h-14 gap-1 overflow-x-auto rounded-lg p-1" style={{ background: token.colorFillQuaternary }}>
                        {layout.items.map((item, index) => (
                            <div
                                key={item.clip.id}
                                draggable
                                onDragStart={(event) => event.dataTransfer.setData("text/plain", item.clip.id)}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                    event.preventDefault();
                                    const dragId = event.dataTransfer.getData("text/plain");
                                    if (dragId) setVideoClips((current) => moveTimelineClip(current, dragId, index));
                                }}
                                onClick={() => setSelectedId(item.clip.id)}
                                className="flex shrink-0 cursor-pointer flex-col justify-between rounded-md border px-2 py-1.5 text-xs"
                                style={{
                                    width: clipBlockWidth(clipEffectiveDuration(item.clip) || item.clip.duration || 3),
                                    borderColor: selectedId === item.clip.id ? token.colorPrimary : token.colorBorderSecondary,
                                    background: selectedId === item.clip.id ? token.colorPrimaryBg : token.colorFillTertiary,
                                }}
                            >
                                <span className="truncate">{item.clip.title}</span>
                                <span className="tabular-nums opacity-60">
                                    {item.clip.duration ? `${formatTrimTime(item.clip.inPoint)} → ${formatTrimTime(item.clip.outPoint)}` : "加载中..."}
                                </span>
                            </div>
                        ))}
                        {!videoClips.length ? <div className="grid flex-1 place-items-center py-3 text-xs opacity-50">未连接视频节点</div> : null}
                    </div>
                </div>

                {selectedVideoItem ? (
                    <div className="flex items-center gap-3">
                        <span className="shrink-0 text-xs opacity-70">「{selectedVideoItem.clip.title}」入点/出点</span>
                        <Slider
                            className="flex-1"
                            range
                            min={0}
                            max={Math.max(selectedVideoItem.clip.duration, 0.01)}
                            step={0.01}
                            value={[selectedVideoItem.clip.inPoint, selectedVideoItem.clip.outPoint]}
                            onChange={(value) => {
                                const [start, end] = value as [number, number];
                                setVideoClips((current) => {
                                    // 用 updateClipRange 的结果回写，但仅在实际变化时触发渲染；
                                    // 浮点误差（如 2.3499999999999996）经 roundTime 对齐后与 Slider
                                    // value 不一致会触发 antd 受控校正死循环，这里保持结果稳定。
                                    let changed = false;
                                    const next = current.map((clip) => {
                                        if (clip.id !== selectedVideoItem.clip.id) return clip;
                                        const updated = updateClipRange(clip, start, end);
                                        if (updated.inPoint === clip.inPoint && updated.outPoint === clip.outPoint) return clip;
                                        changed = true;
                                        return updated;
                                    });
                                    return changed ? next : current;
                                });
                            }}
                            tooltip={{ formatter: (value) => formatTrimTime(value ?? 0) }}
                        />
                        <Button size="small" onClick={() => setVideoClips((current) => current.map((clip) => (clip.id === selectedVideoItem.clip.id ? setClipPointFromPlayhead(clip, selectedVideoItem.start, playheadRef.current, "in") : clip)))}>
                            播放头设为入点
                        </Button>
                        <Button size="small" onClick={() => setVideoClips((current) => current.map((clip) => (clip.id === selectedVideoItem.clip.id ? setClipPointFromPlayhead(clip, selectedVideoItem.start, playheadRef.current, "out") : clip)))}>
                            播放头设为出点
                        </Button>
                        <Button
                            size="small"
                            danger
                            icon={<Trash2 className="size-3.5" />}
                            onClick={() => {
                                stopPlayback();
                                setVideoClips((current) => removeTimelineClip(current, selectedVideoItem.clip.id));
                                setSelectedId(null);
                                currentClipIdRef.current = null;
                            }}
                        />
                    </div>
                ) : null}

                <div className="space-y-1.5">
                    <div className="text-xs opacity-60">音频轨（{audioClips.length} 个片段，可开关静音，合成时按静音状态混音）</div>
                    <div className="thin-scrollbar flex min-h-12 gap-1 overflow-x-auto rounded-lg p-1" style={{ background: token.colorFillQuaternary }}>
                        {audioLayout.items.map((item) => (
                            <div
                                key={item.clip.id}
                                onClick={() => setSelectedId(item.clip.id)}
                                className="flex shrink-0 cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs"
                                style={{
                                    width: clipBlockWidth(clipEffectiveDuration(item.clip) || item.clip.duration || 3),
                                    borderColor: selectedId === item.clip.id ? token.colorPrimary : token.colorBorderSecondary,
                                    background: selectedId === item.clip.id ? token.colorPrimaryBg : token.colorFillTertiary,
                                    opacity: item.clip.muted ? 0.55 : 1,
                                }}
                            >
                                <Music2 className="size-3.5 shrink-0 opacity-70" />
                                <span className="min-w-0 flex-1 truncate">{item.clip.title}</span>
                                <span className="shrink-0 tabular-nums opacity-60">{item.clip.duration ? formatTrimTime(clipEffectiveDuration(item.clip)) : "..."}</span>
                                <button
                                    type="button"
                                    title={item.clip.muted ? "取消静音" : "静音"}
                                    className="shrink-0 opacity-80 transition hover:opacity-100"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setAudioClips((current) => current.map((clip) => (clip.id === item.clip.id ? { ...clip, muted: !clip.muted } : clip)));
                                    }}
                                >
                                    {item.clip.muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                                </button>
                            </div>
                        ))}
                        {!audioClips.length ? <div className="grid flex-1 place-items-center py-2 text-xs opacity-50">未连接音频节点（可选）</div> : null}
                    </div>
                </div>

                {/* 隐藏的元数据加载器与音频播放元素 */}
                {videoClips
                    .filter((clip) => !clip.duration)
                    .map((clip) => (
                        <video
                            key={clip.id}
                            src={clip.src}
                            preload="metadata"
                            className="hidden"
                            onLoadedMetadata={(event) => {
                                // 同步读取 duration：合成事件的 currentTarget 在派发后会被置 null，而 setState 更新函数在下一次渲染时才执行
                                const durationSeconds = event.currentTarget.duration;
                                setVideoClips((current) => {
                                    let changed = false;
                                    const next = current.map((item) => {
                                        if (item.id !== clip.id || item.duration) return item;
                                        const updated = withClipDuration(item, durationSeconds);
                                        if (updated.duration === item.duration && updated.inPoint === item.inPoint && updated.outPoint === item.outPoint) return item;
                                        changed = true;
                                        return updated;
                                    });
                                    return changed ? next : current;
                                });
                            }}
                        />
                    ))}
                {audioClips.map((clip) => (
                    <audio
                        key={clip.id}
                        ref={(element) => {
                            if (element) audioRefs.current.set(clip.id, element);
                            else audioRefs.current.delete(clip.id);
                        }}
                        src={clip.src}
                        preload="auto"
                        muted={clip.muted}
                        className="hidden"
                        onLoadedMetadata={(event) => {
                            const durationSeconds = event.currentTarget.duration;
                            setAudioClips((current) => {
                                let changed = false;
                                const next = current.map((item) => {
                                    if (item.id !== clip.id || item.duration) return item;
                                    const updated = withClipDuration(item, durationSeconds);
                                    if (updated.duration === item.duration && updated.inPoint === item.inPoint && updated.outPoint === item.outPoint) return item;
                                    changed = true;
                                    return updated;
                                });
                                return changed ? next : current;
                            });
                        }}
                    />
                ))}

                <div className="flex items-center justify-between gap-4">
                    <span className="text-xs opacity-50">空格 播放/暂停 · ←/→ 移动播放头 · ↑/↓ 调整片段长度（Shift 精调）· I/O 设入点/出点 · Delete 删除片段</span>
                    <div className="flex shrink-0 items-center gap-2">
                        <Button icon={<X className="size-4" />} onClick={onClose}>
                            取消
                        </Button>
                        <Button type="primary" icon={<Check className="size-4" />} disabled={!canExport} onClick={() => onExport(videoClips, audioClips)}>
                            合成导出视频
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
