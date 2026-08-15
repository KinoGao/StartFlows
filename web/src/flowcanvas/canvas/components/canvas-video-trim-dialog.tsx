"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Modal, Slider } from "antd";
import { Check, Pause, Play, X } from "lucide-react";

import { formatTrimTime, normalizeVideoTrimRange, VIDEO_TRIM_MIN_SECONDS, type VideoTrimRange } from "../utils/canvas-video-tools";

export type { VideoTrimRange };

export function CanvasVideoTrimDialog({ src, open, onClose, onConfirm }: { src: string; open: boolean; onClose: () => void; onConfirm: (range: VideoTrimRange) => void }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [range, setRange] = useState<[number, number]>([0, 0]);

    useEffect(() => {
        if (open) {
            setDuration(0);
            setCurrentTime(0);
            setPlaying(false);
            setRange([0, 0]);
        }
    }, [open, src]);

    const seekTo = (time: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = time;
        setCurrentTime(time);
    };

    const markIn = () => setRange(([, end]) => [Math.min(currentTime, Math.max(0, end - VIDEO_TRIM_MIN_SECONDS)), end]);
    const markOut = () => setRange(([start]) => [start, Math.max(currentTime, Math.min(duration, start + VIDEO_TRIM_MIN_SECONDS))]);

    const confirm = () => {
        const normalized = normalizeVideoTrimRange(range[0], range[1], duration);
        if (!normalized) return;
        onConfirm(normalized);
    };

    return (
        <Modal title="剪辑视频" open={open && Boolean(src)} onCancel={onClose} footer={null} width={720} centered destroyOnHidden>
            <div className="space-y-4">
                <div className="flex justify-center">
                    <video
                        ref={videoRef}
                        src={src}
                        playsInline
                        className="max-h-[52vh] max-w-full rounded-lg bg-black"
                        onLoadedMetadata={(event) => {
                            const nextDuration = event.currentTarget.duration || 0;
                            setDuration(nextDuration);
                            setRange([0, nextDuration]);
                        }}
                        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                        onPlay={() => setPlaying(true)}
                        onPause={() => setPlaying(false)}
                        onEnded={() => setPlaying(false)}
                    />
                </div>

                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <Button
                            size="small"
                            icon={playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                            onClick={() => {
                                const video = videoRef.current;
                                if (!video) return;
                                if (video.paused) void video.play();
                                else video.pause();
                            }}
                        >
                            {playing ? "暂停" : "播放"}
                        </Button>
                        <Slider
                            className="flex-1"
                            min={0}
                            max={Math.max(duration, 0.01)}
                            step={0.05}
                            value={Math.min(currentTime, duration)}
                            onChange={(value) => seekTo(value)}
                            tooltip={{ formatter: (value) => formatTrimTime(value ?? 0) }}
                        />
                        <span className="shrink-0 text-xs tabular-nums opacity-70">
                            {formatTrimTime(currentTime)} / {formatTrimTime(duration)}
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="shrink-0 text-xs opacity-70">剪辑区间</span>
                        <Slider
                            className="flex-1"
                            range
                            min={0}
                            max={Math.max(duration, 0.01)}
                            step={0.05}
                            value={range}
                            onChange={(value) => setRange(value as [number, number])}
                            tooltip={{ formatter: (value) => formatTrimTime(value ?? 0) }}
                        />
                        <span className="shrink-0 text-xs tabular-nums opacity-70">
                            {formatTrimTime(range[0])} → {formatTrimTime(range[1])}（{formatTrimTime(Math.max(0, range[1] - range[0]))}）
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button size="small" disabled={!duration} onClick={markIn}>
                            当前帧设为入点
                        </Button>
                        <Button size="small" disabled={!duration} onClick={markOut}>
                            当前帧设为出点
                        </Button>
                        <span className="text-xs opacity-50">导出为新视频节点，耗时与片段时长相当</span>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                    <Button icon={<X className="size-4" />} onClick={onClose}>
                        取消
                    </Button>
                    <Button type="primary" icon={<Check className="size-4" />} disabled={!duration || range[1] - range[0] < VIDEO_TRIM_MIN_SECONDS} onClick={confirm}>
                        导出剪辑片段
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
