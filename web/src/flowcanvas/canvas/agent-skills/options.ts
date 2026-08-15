/** Toonflow 风格 skill 选项清单（本地 Agent 与在线 Agent 共用）。 */
export const STORY_SKILL_OPTIONS = [
    { label: "喜剧幽默", value: "Comedy_humor" },
    { label: "成长青春", value: "Coming_of_age" },
    { label: "家庭温情", value: "Family_warmth" },
    { label: "历史史诗", value: "Historical_epic" },
    { label: "恐怖灵异", value: "Horror_supernatural" },
    { label: "热血动作", value: "Hot_blooded_action" },
    { label: "悬疑惊悚", value: "Mystery_thriller" },
    { label: "心理剧情", value: "Psychological_drama" },
    { label: "科幻末世", value: "Scifi_post_apocalypse" },
    { label: "甜宠言情", value: "Sweet_romance_novel" },
    { label: "都市职场", value: "Urban_workplace_drama" },
    { label: "古风仙侠", value: "Xianxia_fantasy" },
];

export const ART_SKILL_OPTIONS = [
    { label: "2D 日式动画", value: "2D_90s_japanese_anime" },
    { label: "2D 中式古风", value: "2D_chinese_guofeng" },
    { label: "2D 扁平设计", value: "2D_flat_design" },
    { label: "2D 都市恋爱", value: "2D_mature_urban_romance" },
    { label: "3D 动画渲染", value: "3D_anime_render" },
    { label: "3D 国风传统", value: "3D_chinese_traditional" },
    { label: "3D 黏土定格", value: "3D_clay_stopmotion" },
    { label: "3D 国风赛博", value: "3D_guofeng_cyber" },
    { label: "真人古装", value: "realpeople_ancient_chinese" },
    { label: "真人现代都市", value: "realpeople_modern_city" },
    { label: "真人都市现代", value: "realpeople_urban_modern" },
];

export const DIRECTOR_SKILL_OPTIONS = [
    { label: "斯皮尔伯格 · 好莱坞叙事", value: "spielberg" },
    { label: "库布里克 · 对称冷峻", value: "kubrick" },
    { label: "王家卫 · 东方文艺", value: "wong_kar_wai" },
    { label: "诺兰 · 冷峻科幻", value: "nolan" },
    { label: "张艺谋 · 东方色彩", value: "zhang_yimou" },
    { label: "侯孝贤 · 长镜头写实", value: "hou_hsiao_hsien" },
    { label: "韦斯·安德森 · 对称童话", value: "wes_anderson" },
    { label: "维伦纽瓦 · 宏大静谧", value: "villeneuve" },
];

export type StorySkillValue = (typeof STORY_SKILL_OPTIONS)[number]["value"];
export type ArtSkillValue = (typeof ART_SKILL_OPTIONS)[number]["value"];
export type DirectorSkillValue = (typeof DIRECTOR_SKILL_OPTIONS)[number]["value"];

export function storySkillLabel(value: string) {
    return STORY_SKILL_OPTIONS.find((item) => item.value === value)?.label || value;
}

export function artSkillLabel(value: string) {
    return ART_SKILL_OPTIONS.find((item) => item.value === value)?.label || value;
}

export function directorSkillLabel(value: string) {
    return DIRECTOR_SKILL_OPTIONS.find((item) => item.value === value)?.label || value;
}
