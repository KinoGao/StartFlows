"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Drawer } from "antd";
import { ListTree, X } from "lucide-react";

import type { DramaEpisode, DramaProject, DramaShot } from "../types";
import { useDramaStore } from "../stores/use-drama-store";
import { DramaRichScriptEditor } from "./drama-rich-script-editor";
import { DramaSceneStructure } from "./drama-scene-structure";

export function DramaScriptWorkspace({
    project,
    episode,
    selectedShotId,
    onSelectedShotChange,
    analyzing,
    onAnalyze,
}: {
    project: DramaProject;
    episode: DramaEpisode;
    selectedShotId?: string;
    onSelectedShotChange: (shotId?: string) => void;
    analyzing: boolean;
    onAnalyze: () => void;
}) {
    const updateEpisode = useDramaStore((state) => state.updateEpisode);
    const selectTextRef = useRef<(value: string) => void>(() => undefined);
    const [mobilePanel, setMobilePanel] = useState<"scenes">();
    const [fullscreen, setFullscreen] = useState(false);
    useEffect(() => {
        if (selectedShotId && !episode.shots.some((shot) => shot.id === selectedShotId)) onSelectedShotChange(undefined);
    }, [episode.shots, onSelectedShotChange, selectedShotId]);
    const registerEditor = useCallback((selectText: (value: string) => void) => {
        selectTextRef.current = selectText;
    }, []);

    const selectShot = (shot: DramaShot) => {
        onSelectedShotChange(shot.id);
        setMobilePanel(undefined);
        selectTextRef.current(shot.sourceText || shot.description || shot.title);
    };

    return (
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-2 overflow-hidden min-[1120px]:grid-cols-[200px_minmax(700px,1fr)]" data-drama-script-workspace>
            <div className="hidden min-h-0 min-w-0 overflow-hidden rounded-lg border border-border min-[1180px]:block">
                <DramaSceneStructure project={project} episode={episode} selectedShotId={selectedShotId} onSelect={selectShot} analyzing={analyzing} onAnalyze={onAnalyze} />
            </div>
            <div className="relative flex min-h-0 min-w-0 flex-col">
                <Button type="default" size="small" className="!absolute !left-2 !top-2 !z-10 min-[1120px]:!hidden" icon={<ListTree className="size-3.5" />} onClick={() => setMobilePanel("scenes")}>
                    场景结构
                </Button>
                <DramaRichScriptEditor episode={episode} fullscreen={fullscreen} onFullscreenChange={setFullscreen} onReady={registerEditor} onChange={(script, scriptRichContent) => updateEpisode(project.id, episode.id, { script, scriptRichContent })} />
            </div>
            <Drawer title="场景结构" placement="left" size={300} open={mobilePanel === "scenes"} closable={false} onClose={() => setMobilePanel(undefined)} styles={{ wrapper: { maxWidth: "100vw" }, body: { padding: 0 } }}>
                <div className="flex h-full min-h-0 flex-col">
                    <div className="flex justify-end border-b border-border px-3 py-2">
                        <Button type="text" size="small" icon={<X className="size-3.5" />} onClick={() => setMobilePanel(undefined)}>
                            关闭场景结构
                        </Button>
                    </div>
                    <DramaSceneStructure project={project} episode={episode} selectedShotId={selectedShotId} onSelect={selectShot} analyzing={analyzing} onAnalyze={onAnalyze} />
                </div>
            </Drawer>
        </div>
    );
}
