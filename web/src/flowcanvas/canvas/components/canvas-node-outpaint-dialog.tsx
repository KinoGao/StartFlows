"use client";

import { useEffect, useState } from "react";
import { Button, Modal } from "antd";
import { WandSparkles } from "lucide-react";

import { OUTPAINT_RATIOS } from "../utils/canvas-image-tools";

export function CanvasNodeOutpaintDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (ratioId: string) => void }) {
    const [ratioId, setRatioId] = useState(OUTPAINT_RATIOS[0].id);

    useEffect(() => {
        if (open) setRatioId(OUTPAINT_RATIOS[0].id);
    }, [dataUrl, open]);

    const ratio = OUTPAINT_RATIOS.find((item) => item.id === ratioId) || OUTPAINT_RATIOS[0];

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={760} centered destroyOnHidden>
            <div className="space-y-5">
                <div>
                    <h2 className="text-xl font-semibold">AI 扩图</h2>
                    <p className="mt-1 text-sm opacity-60">以当前图为参考向外延展补全画面，虚线框为目标画幅</p>
                </div>
                <div className="grid gap-6 md:grid-cols-[minmax(260px,1fr)_240px]">
                    <div className="grid min-h-[300px] place-items-center rounded-xl border p-4">
                        <div className="max-h-[320px] max-w-full overflow-hidden rounded-lg border border-dashed border-black/25 dark:border-white/25" style={{ aspectRatio: `${ratio.width} / ${ratio.height}`, height: "min(320px, 100%)" }}>
                            <img src={dataUrl} alt="" className="h-full w-full object-contain" draggable={false} />
                        </div>
                    </div>
                    <div className="space-y-3 py-2">
                        <div className="text-sm font-medium opacity-75">目标画幅</div>
                        <div className="grid grid-cols-3 gap-2">
                            {OUTPAINT_RATIOS.map((item) => (
                                <Button key={item.id} type={ratioId === item.id ? "primary" : "default"} onClick={() => setRatioId(item.id)}>
                                    {item.label}
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button type="primary" size="large" icon={<WandSparkles className="size-4" />} onClick={() => onConfirm(ratioId)}>
                        AI 生成
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
