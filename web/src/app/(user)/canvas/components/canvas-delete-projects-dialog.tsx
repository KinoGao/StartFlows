"use client";

import { useState } from "react";
import { App, Button, Modal } from "antd";

import { useCanvasStore } from "../stores/use-canvas-store";
import { useCanvasUiStore } from "../stores/use-canvas-ui-store";

export function CanvasDeleteProjectsDialog() {
    const { message } = App.useApp();
    const [deleting, setDeleting] = useState(false);
    const ids = useCanvasUiStore((state) => state.deleteProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const removeSelectedIds = useCanvasUiStore((state) => state.removeSelectedProjectIds);
    const deleteProjects = useCanvasStore((state) => state.deleteProjects);
    const confirm = async () => {
        setDeleting(true);
        try {
            await deleteProjects(ids);
            removeSelectedIds(ids);
            setDeleteIds([]);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "画布删除失败");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Modal
            title="删除画布？"
            open={ids.length > 0}
            centered
            onCancel={() => setDeleteIds([])}
            footer={
                <>
                    <Button onClick={() => setDeleteIds([])}>取消</Button>
                    <Button danger type="primary" loading={deleting} onClick={() => void confirm()}>
                        删除
                    </Button>
                </>
            }
        >
            <p className="text-sm text-stone-500">将永久删除 {ids.length} 个画布、节点、连线和专属生成记录；仍被素材库、其他项目或作品引用的媒体会保留。</p>
        </Modal>
    );
}
