import type { DramaEpisode, DramaNamedAsset, DramaProject, DramaShot, DramaShotContinuity } from "@/lib/drama-project-contract";

export type CompiledDramaPrompts = {
    imagePrompt: string;
    startFramePrompt: string;
    endFramePrompt: string;
    videoPrompt: string;
};

export function compileDramaShotPrompts(project: DramaProject, episode: DramaEpisode, shot: DramaShot): CompiledDramaPrompts {
    const scene = project.scenes.find((item) => item.id === shot.sceneId);
    const characters = project.characters.filter((item) => shot.characterIds.includes(item.id));
    const props = project.props.filter((item) => shot.propIds.includes(item.id));
    const clues = project.clues.filter((item) => shot.clueIds.includes(item.id));
    const continuity = continuityLines(shot.continuity);
    const shared = compact([
        `项目：${project.title} / ${episode.title}`,
        project.style ? `统一风格：${project.style}` : "",
        `画幅：${project.ratio}`,
        scene ? `场景设定：${assetText(scene)}` : "",
        characters.length ? `角色设定：${characters.map(assetText).join("；")}` : "",
        props.length ? `道具设定：${props.map(assetText).join("；")}` : "",
        clues.length ? `叙事线索：${clues.map((item) => `${assetText(item)}；回收：${item.payoff}`).join("；")}` : "",
        continuity.length ? `连续性约束：${continuity.join("；")}` : "",
        shot.negativePrompt ? `避免：${shot.negativePrompt}` : "",
    ]);
    const imagePrompt = compact([
        ...shared,
        `镜头事实：${shot.description || shot.sourceText}`,
        shot.imagePrompt ? `视觉方案：${shot.imagePrompt}` : "",
        shot.startFramePrompt ? `起始画面：${shot.startFramePrompt}` : "",
        "保持角色身份、服装、道具形态、场景空间关系与相邻镜头一致，不添加未在设定中出现的主体或文字。",
    ]).join("\n");
    const startFramePrompt = compact([...shared, `起始动作状态：${shot.continuity?.actionStart || shot.description}`, shot.startFramePrompt || shot.imagePrompt]).join("\n");
    const endFramePrompt = compact([...shared, `结束动作状态：${shot.continuity?.actionEnd || shot.description}`, shot.endFramePrompt || shot.videoPrompt || shot.imagePrompt]).join("\n");
    const videoPrompt = compact([
        ...shared,
        `镜头事实：${shot.description || shot.sourceText}`,
        shot.videoPrompt ? `动态方案：${shot.videoPrompt}` : "",
        shot.cameraMotion ? `镜头运动：${shot.cameraMotion}` : "",
        `从“${shot.continuity?.actionStart || "镜头起始状态"}”自然过渡到“${shot.continuity?.actionEnd || "镜头结束状态"}”，时长 ${shot.duration} 秒。`,
        shot.dialogue ? `对白：${shot.dialogue}` : "",
        shot.narration ? `画外音节奏：${shot.narration}` : "",
        "动作连续、物理合理，保持人物身份、服装、视线、轴线和运动方向稳定。",
    ]).join("\n");
    return { imagePrompt, startFramePrompt, endFramePrompt, videoPrompt };
}

export function compileDramaAssetReferencePrompt(project: DramaProject, asset: DramaNamedAsset, kind: "角色" | "场景" | "道具") {
    return compact([
        `${kind}设定图，${project.ratio}，${project.style}`,
        `名称：${asset.name}`,
        `基础描述：${asset.description}`,
        asset.profile?.visualIdentity ? `视觉识别：${asset.profile.visualIdentity}` : "",
        asset.profile?.styling ? `造型与材质：${asset.profile.styling}` : "",
        asset.profile?.colorPalette ? `固定色彩：${asset.profile.colorPalette}` : "",
        asset.profile?.consistencyRules ? `一致性规则：${asset.profile.consistencyRules}` : "",
        kind === "角色" ? "完整角色设定视图，五官与体型清晰，正面为主，干净中性背景，不添加文字。" : "主体结构清晰，便于后续镜头稳定引用，不添加文字。",
    ]).join("\n");
}

function assetText(asset: DramaNamedAsset) {
    return compact([
        `${asset.name}：${asset.description}`,
        asset.profile?.visualIdentity,
        asset.profile?.styling,
        asset.profile?.colorPalette ? `色彩 ${asset.profile.colorPalette}` : "",
        asset.profile?.consistencyRules ? `固定规则 ${asset.profile.consistencyRules}` : "",
    ]).join("，");
}

function continuityLines(value?: DramaShotContinuity) {
    if (!value) return [];
    return compact([
        value.shotSize ? `景别 ${value.shotSize}` : "",
        value.cameraAngle ? `机位 ${value.cameraAngle}` : "",
        value.composition ? `构图 ${value.composition}` : "",
        value.characterBlocking ? `站位 ${value.characterBlocking}` : "",
        value.gazeDirection ? `视线 ${value.gazeDirection}` : "",
        value.screenDirection ? `运动方向 ${value.screenDirection}` : "",
        value.axisRule ? `轴线 ${value.axisRule}` : "",
        value.continuityNotes,
    ]);
}

function compact(values: Array<string | undefined>) {
    return values.map((value) => value?.trim() || "").filter(Boolean);
}
