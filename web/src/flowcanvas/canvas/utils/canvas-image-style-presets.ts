/**
 * 图片节点风格库预设清单、分类与筛选逻辑。
 * 对齐 LibTV 风格库：分类浏览（摄影写真 / 电商营销 / 动漫游戏 / 风格插画 / 3D 渲染 / 艺术设计）
 * + 关键词搜索（匹配中文名与英文提示词片段）+ 账号级自定义风格（随用户配置同步后端）。
 * 风格以提示词片段形式在生成时追加，不修改用户原始提示词；重选即替换，不叠加。
 */

import type { CustomImageStyle } from "@/flowcanvas/stores/use-config-store";

export type ImageStyleCategory = "photo" | "ecommerce" | "anime" | "illustration" | "render3d" | "art";

export type ImageStylePreset = {
    id: string;
    label: string;
    shortLabel: string;
    description: string;
    /** 追加进图片生成提示词的英文风格描述 */
    prompt: string;
    /** 预设卡片底色（半透明色块，沿用风格库视觉） */
    tone: string;
    /** 所属分类；自动风格为空串（仅出现在「全部」与搜索结果），自定义风格为 custom */
    category: ImageStyleCategory | "custom" | "";
};

export type ImageStyleTab = ImageStyleCategory | "all" | "custom";

export const IMAGE_STYLE_CATEGORY_TABS: { id: ImageStyleTab; label: string }[] = [
    { id: "all", label: "全部" },
    { id: "photo", label: "摄影写真" },
    { id: "ecommerce", label: "电商营销" },
    { id: "anime", label: "动漫游戏" },
    { id: "illustration", label: "风格插画" },
    { id: "render3d", label: "3D 渲染" },
    { id: "art", label: "艺术设计" },
    { id: "custom", label: "自定义" },
];

const STYLE_TONES = ["rgba(80,105,151,.16)", "rgba(91,126,107,.16)", "rgba(129,91,144,.16)", "rgba(147,103,74,.16)", "rgba(82,115,132,.16)", "rgba(154,126,66,.16)"];

export const CUSTOM_STYLE_TONE = "rgba(154,126,66,.2)";

type ImageStyleSeed = Omit<ImageStylePreset, "tone">;

const IMAGE_STYLE_SEEDS: ImageStyleSeed[] = [
    { id: "", label: "自动风格", shortLabel: "风格", description: "完全按提示词和参考素材生成", prompt: "", category: "" },
    // 摄影写真
    { id: "cinematic", label: "电影质感", shortLabel: "电影质感", description: "电影光影、真实镜头与层次构图", prompt: "cinematic still, dramatic lighting, realistic lens, layered composition", category: "photo" },
    { id: "documentary", label: "纪实写实", shortLabel: "纪实写实", description: "自然光线、真实材质与生活感", prompt: "documentary photography, natural light, authentic texture, lifelike detail", category: "photo" },
    { id: "retro", label: "复古胶片", shortLabel: "复古胶片", description: "柔和颗粒、低饱和与胶片色彩", prompt: "vintage film photography, subtle grain, muted colors, analog texture", category: "photo" },
    { id: "japanese-film", label: "日系胶片", shortLabel: "日系胶片", description: "清新空气感、高明度与柔和色调", prompt: "japanese film photography style, airy bright tones, soft pastel colors, gentle light", category: "photo" },
    { id: "commercial-portrait", label: "商业人像", shortLabel: "商业人像", description: "影棚布光、精致肤质与高级质感", prompt: "studio portrait photography, professional lighting, refined skin texture, premium look", category: "photo" },
    { id: "street-snap", label: "街头抓拍", shortLabel: "街头抓拍", description: "街头瞬间、自然光影与故事感", prompt: "street photography, candid moment, natural ambient light, storytelling composition", category: "photo" },
    // 电商营销
    { id: "commercial", label: "商业摄影", shortLabel: "商业摄影", description: "精致布光、干净背景与产品级细节", prompt: "premium commercial photography, polished lighting, clean composition, crisp detail", category: "ecommerce" },
    { id: "product-white", label: "产品白底图", shortLabel: "白底图", description: "纯白背景、均匀布光与标准产品视角", prompt: "product photography on pure white background, even soft lighting, standard catalog angle", category: "ecommerce" },
    { id: "food-photography", label: "美食摄影", shortLabel: "美食摄影", description: "诱人色泽、热气氛围与精致摆盘", prompt: "appetizing food photography, rich colors, fresh ingredients, styled plating, shallow depth of field", category: "ecommerce" },
    { id: "beauty-texture", label: "美妆质感", shortLabel: "美妆质感", description: "细腻质地、水润光泽与高级感", prompt: "beauty product photography, delicate texture, dewy glow, luxurious mood, macro detail", category: "ecommerce" },
    { id: "ecommerce-scene", label: "电商场景图", shortLabel: "场景图", description: "生活化场景、氛围道具与促销感构图", prompt: "ecommerce lifestyle scene, product in styled setting, warm inviting atmosphere, promotional composition", category: "ecommerce" },
    // 动漫游戏
    { id: "anime", label: "二维动画", shortLabel: "二维动画", description: "清晰线稿、平涂色彩与动画表现", prompt: "2D anime illustration, clean line art, cel shading, expressive composition", category: "anime" },
    { id: "ghibli-watercolor", label: "吉卜力水彩", shortLabel: "吉卜力", description: "手绘水彩、柔和光影与治愈氛围", prompt: "hand-painted watercolor anime background, soft light, warm nostalgic mood, lush scenery", category: "anime" },
    { id: "cyberpunk", label: "赛博朋克", shortLabel: "赛博朋克", description: "霓虹灯效、雨夜都市与高对比", prompt: "cyberpunk cityscape, neon lights, rainy night, high contrast, futuristic atmosphere", category: "anime" },
    { id: "pixel-art", label: "像素游戏", shortLabel: "像素风", description: "复古像素、有限色板与游戏画面感", prompt: "retro pixel art, limited color palette, crisp pixels, classic video game style", category: "anime" },
    { id: "ink-wash", label: "国风水墨", shortLabel: "国风水墨", description: "水墨晕染、留白意境与东方美学", prompt: "chinese ink wash painting, flowing brush strokes, elegant negative space, oriental aesthetics", category: "anime" },
    // 风格插画
    { id: "flat-minimal", label: "极简扁平插画", shortLabel: "极简扁平", description: "几何色块、极简造型与留白构图", prompt: "minimal flat illustration, geometric shapes, bold color blocks, generous negative space", category: "illustration" },
    { id: "watercolor-illustration", label: "水彩插画", shortLabel: "水彩插画", description: "透明水彩、晕染肌理与轻盈色调", prompt: "delicate watercolor illustration, translucent washes, soft bleeding texture, light airy palette", category: "illustration" },
    { id: "pop-art", label: "波普艺术", shortLabel: "波普艺术", description: "高饱和撞色、网点与复古海报感", prompt: "pop art style, bold saturated colors, halftone dots, retro poster look", category: "illustration" },
    { id: "doodle", label: "手绘涂鸦", shortLabel: "手绘涂鸦", description: "随性线条、手账质感与俏皮元素", prompt: "hand-drawn doodle illustration, playful sketchy lines, journal style, whimsical details", category: "illustration" },
    { id: "line-art", label: "线条插画", shortLabel: "线条插画", description: "单色线稿、流畅轮廓与装饰细节", prompt: "elegant line art illustration, flowing contours, monochrome strokes, decorative details", category: "illustration" },
    // 3D 渲染
    { id: "clay-3d", label: "黏土 3D", shortLabel: "黏土 3D", description: "黏土材质、圆润造型与手作温度", prompt: "3D clay render, soft clay material, rounded cute shapes, handmade feel, studio lighting", category: "render3d" },
    { id: "isometric-3d", label: "等距 3D", shortLabel: "等距 3D", description: "等距视角、微缩场景与干净渲染", prompt: "isometric 3D render, miniature diorama scene, clean materials, soft global illumination", category: "render3d" },
    { id: "blind-box", label: "盲盒玩具风", shortLabel: "盲盒风", description: "Q 版搪胶质感、潮玩配色与萌系造型", prompt: "cute vinyl toy figure, chibi proportions, glossy collectible finish, trendy designer toy style", category: "render3d" },
    { id: "glassmorphism", label: "玻璃拟态", shortLabel: "玻璃拟态", description: "磨砂玻璃、通透层次与柔和光晕", prompt: "glassmorphism 3D design, frosted glass, translucent layers, soft glow, modern ui aesthetic", category: "render3d" },
    { id: "low-poly", label: "低多边形", shortLabel: "低多边形", description: "低面数几何、渐变配色与简洁场景", prompt: "low poly 3D art, faceted geometry, gradient color palette, minimal clean scene", category: "render3d" },
    // 艺术设计
    { id: "minimal-poster", label: "极简海报", shortLabel: "极简海报", description: "大留白、网格排版与克制配色", prompt: "minimalist poster design, generous whitespace, grid layout, restrained color palette", category: "art" },
    { id: "bauhaus", label: "包豪斯", shortLabel: "包豪斯", description: "几何构成、三原色与功能主义", prompt: "bauhaus design, geometric composition, primary colors, functionalist modernism", category: "art" },
    { id: "new-chinese", label: "新中式", shortLabel: "新中式", description: "东方意象、现代排版与雅致配色", prompt: "modern chinese aesthetic design, oriental motifs, elegant muted palette, contemporary layout", category: "art" },
    { id: "vaporwave", label: "蒸汽波", shortLabel: "蒸汽波", description: "粉紫渐变、复古雕像与故障感", prompt: "vaporwave aesthetic, pink purple gradients, classical statues, retro glitch elements", category: "art" },
    { id: "paper-cut", label: "剪纸艺术", shortLabel: "剪纸艺术", description: "层叠纸艺、镂空光影与民俗色彩", prompt: "layered paper cut art, intricate hollow patterns, depth shadow, folk craft colors", category: "art" },
];

export const IMAGE_STYLE_PRESETS: ImageStylePreset[] = IMAGE_STYLE_SEEDS.map((seed, index) => ({
    ...seed,
    tone: seed.id ? STYLE_TONES[(index - 1) % STYLE_TONES.length] : "rgba(127,127,127,.08)",
}));

export const CUSTOM_IMAGE_STYLE_PREFIX = "custom:";

export function customImageStyleId(id: string) {
    return `${CUSTOM_IMAGE_STYLE_PREFIX}${id}`;
}

/** 自定义风格（账号配置里的轻量记录）转换为风格卡片结构 */
export function customStyleToPreset(style: CustomImageStyle): ImageStylePreset {
    return {
        id: customImageStyleId(style.id),
        label: style.name,
        shortLabel: style.name,
        description: style.prompt,
        prompt: style.prompt,
        tone: CUSTOM_STYLE_TONE,
        category: "custom",
    };
}

/**
 * 按分类标签与关键词筛选风格。有关键词时跨全部分类搜索，
 * 匹配中文名、描述与英文提示词片段（大小写不敏感）。
 */
export function filterImageStylePresets(presets: ImageStylePreset[], tab: ImageStyleTab, keyword: string) {
    const term = keyword.trim().toLowerCase();
    const scoped = term || tab === "all" ? presets : presets.filter((preset) => preset.category === tab);
    if (!term) return scoped;
    return scoped.filter((preset) => [preset.label, preset.shortLabel, preset.description, preset.prompt].some((field) => field.toLowerCase().includes(term)));
}

/** 解析风格 id（含自定义风格）为预设结构；空或未知 id 回退为自动风格 */
export function resolveImageStylePreset(styleId: string | undefined, customStyles: CustomImageStyle[] = []): ImageStylePreset {
    if (!styleId) return IMAGE_STYLE_PRESETS[0];
    if (styleId.startsWith(CUSTOM_IMAGE_STYLE_PREFIX)) {
        const custom = customStyles.find((style) => customImageStyleId(style.id) === styleId);
        return custom ? customStyleToPreset(custom) : IMAGE_STYLE_PRESETS[0];
    }
    return IMAGE_STYLE_PRESETS.find((preset) => preset.id === styleId) || IMAGE_STYLE_PRESETS[0];
}

/** 取风格对应的提示词片段；未选择或未知 id 返回空串 */
export function imageStylePresetPrompt(styleId: string | undefined, customStyles: CustomImageStyle[] = []) {
    if (!styleId) return "";
    return resolveImageStylePreset(styleId, customStyles).prompt;
}
