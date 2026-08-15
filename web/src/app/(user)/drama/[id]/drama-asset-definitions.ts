export type DramaAssetKind = "characters" | "scenes" | "props" | "clues";

export const DRAMA_ASSET_DEFINITIONS: Record<
    DramaAssetKind,
    {
        title: string;
        label: string;
        description: string;
        placeholder: string;
        profileLabels: [string, string, string, string];
    }
> = {
    characters: {
        title: "角色",
        label: "人物",
        description: "固定人物外貌、造型、配色与声音，供所有镜头稳定引用。",
        placeholder: "例如：女主角林夏",
        profileLabels: ["固定外貌", "服装与造型", "标志色", "一致性规则"],
    },
    scenes: {
        title: "场景",
        label: "地点",
        description: "记录空间结构、陈设、材质和环境色，保证跨镜头空间连续。",
        placeholder: "例如：旧城区诊所",
        profileLabels: ["空间结构", "陈设与材质", "环境色", "固定空间规则"],
    },
    props: {
        title: "道具",
        label: "道具",
        description: "管理关键物件的外形、材质与使用规则，避免生成结果前后变化。",
        placeholder: "例如：裂屏旧手机",
        profileLabels: ["外形识别", "材质与细节", "固定色彩", "使用与一致性规则"],
    },
    clues: {
        title: "线索",
        label: "线索",
        description: "追踪线索的视觉形态、出现位置和回收方式，服务剧情审计。",
        placeholder: "例如：染血的手帕",
        profileLabels: ["视觉识别", "出现形态", "提示色", "前后呼应规则"],
    },
};
