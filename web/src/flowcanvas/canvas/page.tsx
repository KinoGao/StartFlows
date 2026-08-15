"use client";

import { useCallback, useRef, useState } from "react";
import { useNavigate } from "@/flowcanvas/lib/next-router";
import { App, Button } from "antd";
import { Download, FileUp, Plus } from "lucide-react";

import { readZip } from "@/flowcanvas/lib/zip";
import { BackendWorkspaceGate } from "@/flowcanvas/components/layout/backend-workspace-gate";
import { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";
import { createCanvasProjectOnServer, replaceBackendStorageReferences, uploadBackendFile, type BackendUploadedFile } from "@/flowcanvas/services/api/backend-storage";
import { setMediaBlob } from "@/flowcanvas/services/file-storage";
import { setImageBlob } from "@/flowcanvas/services/image-storage";
import { useUserStore } from "@/flowcanvas/stores/use-user-store";
import { CanvasDeleteProjectsDialog } from "./components/canvas-delete-projects-dialog";
import { CanvasProjectCard } from "./components/canvas-project-card";
import type { CanvasExportFile } from "./export-types";
import { useCanvasStore, type CanvasProject } from "./stores/use-canvas-store";
import { preloadCanvasMedia } from "./utils/canvas-media-preload";
import { useCanvasUiStore } from "./stores/use-canvas-ui-store";
import { exportCanvasProjects } from "./utils/canvas-export";

export default function CanvasPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const userHydrated = useUserStore((state) => state.hydrated);
    const user = useUserStore((state) => state.user);
    const token = useUserStore((state) => state.token);
    const saveMode = useUserStore((state) => state.saveMode);
    const workspaceStatus = useUserStore((state) => state.workspaceStatus);
    const backendWorkspaceReady = saveMode !== "backend" || (userHydrated && Boolean(user && token) && workspaceStatus === "ready");
    const projects = useCanvasStore((state) => state.projects);
    const importProject = useCanvasStore((state) => state.importProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);

    const [enteringProject, setEnteringProject] = useState<CanvasProject | null>(null);
    const enterProject = useCallback(
        (id: string) => {
            const project = projects.find((item) => item.id === id);
            if (!project) {
                navigate(`/canvas/${id}`);
                return;
            }
            setEnteringProject(project);
            void (async () => {
                try {
                    // 预加载缩略图内容（data:image 转存 + 真实下载图片缩略图），
                    // 进入动画等待内容就绪，超时兜底不阻塞进入画布
                    await Promise.race([
                        preloadCanvasMedia(project),
                        new Promise<void>((resolve) => setTimeout(resolve, 12000)),
                    ]);
                } finally {
                    navigate(`/canvas/${id}`);
                }
            })();
        },
        [navigate, projects],
    );
    const createAndEnter = async () => {
        try {
            // 先建服务端项目拿到权威 id，再进编辑器（VOZEB 画布项目 id 由服务端分配）
            const project = await createCanvasProjectOnServer(`无限画布 ${projects.length + 1}`);
            const state = useCanvasStore.getState();
            state.replaceProjects([...state.projects, project], state.projectTombstones);
            enterProject(project.id);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "画布创建失败");
        }
    };
    const importCanvas = async (file?: File) => {
        if (!file) return;
        try {
            const zip = await readZip(file);
            const projectFile = zip.get("projects.json");
            if (!projectFile) throw new Error("missing projects.json");
            const data = JSON.parse(await projectFile.text()) as CanvasExportFile;
            const packageFiles = new Map<string, { path: string; blob: Blob }>();
            data.projects.forEach((project) =>
                project.files.forEach((item) => {
                    if (packageFiles.has(item.storageKey)) return;
                    const blob = zip.get(item.path);
                    if (!blob) throw new Error(`missing media file: ${item.path}`);
                    packageFiles.set(item.storageKey, {
                        path: item.path,
                        blob: blob.type ? blob : blob.slice(0, blob.size, item.mimeType),
                    });
                }),
            );

            if (saveMode === "backend") {
                if (!token) throw new Error("请先登录后端账号");
                const uploads = new Map<string, BackendUploadedFile>();
                await Promise.all(
                    Array.from(packageFiles.entries()).map(async ([storageKey, item]) => {
                        const uploaded = await uploadBackendFile(token, item.blob, item.path.split("/").pop() || "file");
                        uploads.set(storageKey, uploaded);
                    }),
                );
                for (const item of data.projects) {
                    const prepared = replaceBackendStorageReferences(item.project, uploads, token);
                    const created = await createCanvasProjectOnServer(prepared.title || "导入画布", prepared);
                    const state = useCanvasStore.getState();
                    state.replaceProjects([...state.projects, created], state.projectTombstones);
                }
            } else {
                await Promise.all(
                    Array.from(packageFiles.entries()).map(([storageKey, item]) =>
                        storageKey.startsWith("image:") ? setImageBlob(storageKey, item.blob) : setMediaBlob(storageKey, item.blob),
                    ),
                );
                data.projects.forEach((item) => importProject(item.project));
            }
            message.success(`已导入 ${data.projects.length} 个画布`);
        } catch {
            message.error("导入失败，请选择有效的画布压缩包");
        } finally {
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    if (!backendWorkspaceReady) return <BackendWorkspaceGate title="画布工作区" />;

    return (
        <>
        <main className="h-full overflow-auto bg-background text-foreground">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
                <header className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="text-xs text-muted-foreground">画布库</p>
                        <h1 className="mt-2 text-3xl font-semibold tracking-tight">我的画布</h1>
                        <p className="mt-2 text-sm text-muted-foreground">创建、导入和管理你的无限画布项目。</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedIds.length ? (
                            <>
                                <Button
                                    disabled={!hydrated}
                                    icon={<Download className="size-4" />}
                                    onClick={() =>
                                        void exportCanvasProjects(
                                            projects.filter((project) => selectedIds.includes(project.id)),
                                            `无限画布-${selectedIds.length}个项目`,
                                        )
                                    }
                                >
                                    导出选中
                                </Button>
                                <Button disabled={!hydrated} onClick={() => setDeleteIds(selectedIds)}>
                                    删除选中
                                </Button>
                            </>
                        ) : null}
                        {projects.length ? (
                            <Button disabled={!hydrated} onClick={() => setDeleteIds(projects.map((project) => project.id))}>
                                删除全部
                            </Button>
                        ) : null}
                        <Button disabled={!hydrated} icon={<FileUp className="size-4" />} onClick={() => inputRef.current?.click()}>
                            导入画布
                        </Button>
                        <Button disabled={!hydrated} type="primary" icon={<Plus className="size-4" />} onClick={createAndEnter}>
                            新建画布
                        </Button>
                    </div>
                </header>

                {!hydrated ? (
                    <section className="flex min-h-[360px] items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted-foreground">正在加载画布...</section>
                ) : projects.length ? (
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {projects.map((project) => (
                            <CanvasProjectCard key={project.id} project={project} onOpen={() => enterProject(project.id)} />
                        ))}
                    </div>
                ) : (
                    <section className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-border bg-card text-center">
                        <h2 className="text-xl font-medium">还没有画布</h2>
                        <p className="mt-3 text-sm text-muted-foreground">新建一个画布后，就可以独立保存节点、连线和画布外观。</p>
                        <Button type="primary" className="mt-6" icon={<Plus className="size-4" />} onClick={createAndEnter}>
                            新建画布
                        </Button>
                    </section>
                )}
            </div>

            <input ref={inputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importCanvas(event.target.files?.[0])} />
            <CanvasDeleteProjectsDialog />
            </main>
            {enteringProject ? <CanvasEnteringCover project={enteringProject} /> : null}
        </>
    );
}

function CanvasEnteringCover({ project }: { project: CanvasProject }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div
            className="fixed inset-0 z-[300] grid place-items-center"
            style={{ backgroundColor: theme.canvas.background }}
            aria-live="polite"
            aria-busy="true"
        >
            <div className="flex flex-col items-center gap-6">
                <div className="relative size-16">
                    <div
                        className="absolute inset-0 animate-spin rounded-full border-2 border-transparent"
                        style={{ borderTopColor: theme.ui.accent, borderRightColor: theme.ui.accentSoft, borderBottomColor: theme.ui.accentSoft }}
                    />
                    <div
                        className="absolute inset-3 animate-pulse rounded-full"
                        style={{ background: theme.ui.accent, boxShadow: `0 0 0 6px ${theme.ui.accentSoft}` }}
                    />
                </div>
                <div className="text-center">
                    <p className="text-base font-medium" style={{ color: theme.node.text }}>
                        {project.title}
                    </p>
                    <p className="mt-2 text-xs" style={{ color: theme.node.muted }}>
                        正在加载画布…
                    </p>
                </div>
            </div>
        </div>
    );
}
