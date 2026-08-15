/**
 * 运镜控制（视频节点）与摄像机控制（图片节点）预设清单及提示词拼装。
 * 对齐 LibTV：运镜提供 20+ 预设，摄像机提供相机型号 / 镜头 / 焦距 / 光圈参数，
 * 均以提示词片段形式在提交生成时追加，不修改用户原始提示词；重选即替换，不叠加。
 */

export type CanvasVideoCameraPreset = {
    id: string;
    label: string;
    shortLabel: string;
    description: string;
    /** 追加进视频生成提示词的英文运镜描述 */
    prompt: string;
    /** 预设卡片底色（半透明色块，沿用风格库视觉） */
    tone: string;
};

const CAMERA_TONES = ["rgba(80,105,151,.16)", "rgba(91,126,107,.16)", "rgba(129,91,144,.16)", "rgba(147,103,74,.16)", "rgba(82,115,132,.16)", "rgba(154,126,66,.16)"];

type VideoCameraPresetSeed = Omit<CanvasVideoCameraPreset, "tone">;

const VIDEO_CAMERA_SEEDS: VideoCameraPresetSeed[] = [
    { id: "", label: "自动运镜", shortLabel: "运镜", description: "由模型根据场景自动安排镜头", prompt: "" },
    { id: "fixed", label: "固定镜头", shortLabel: "固定镜头", description: "机位固定，突出主体动作", prompt: "locked camera, fixed shot" },
    { id: "dolly-in", label: "推镜头", shortLabel: "推镜头", description: "平滑向主体靠近，增强聚焦", prompt: "smooth dolly in toward the subject" },
    { id: "dolly-out", label: "拉镜头", shortLabel: "拉镜头", description: "逐步拉远，展示环境关系", prompt: "smooth dolly out revealing the environment" },
    { id: "pan", label: "摇镜头", shortLabel: "摇镜头", description: "机位不动，镜头水平扫过场景", prompt: "smooth horizontal pan across the scene" },
    { id: "tilt", label: "俯仰镜头", shortLabel: "俯仰镜头", description: "镜头垂直上摇或下摇", prompt: "vertical tilt shot, camera tilting up or down" },
    { id: "truck", label: "移镜头", shortLabel: "移镜头", description: "机位水平横移，与主体平行", prompt: "lateral trucking shot moving parallel to the subject" },
    { id: "tracking", label: "跟镜头", shortLabel: "跟镜头", description: "镜头紧随主体移动", prompt: "tracking shot following the subject" },
    { id: "orbit", label: "环绕镜头", shortLabel: "环绕镜头", description: "围绕主体平稳环绕运动", prompt: "smooth orbit camera around the subject" },
    { id: "crane", label: "升降镜头", shortLabel: "升降镜头", description: "机位垂直升起或降下", prompt: "crane shot, camera rising or descending vertically" },
    { id: "handheld", label: "手持镜头", shortLabel: "手持镜头", description: "轻微手持晃动的临场感", prompt: "handheld camera with subtle natural shake" },
    { id: "zoom", label: "变焦镜头", shortLabel: "变焦镜头", description: "焦距推拉，画面放大或缩小", prompt: "smooth zoom shot, lens zooming in or out" },
    { id: "whip-pan", label: "甩镜头", shortLabel: "甩镜头", description: "快速横甩转场，动感强烈", prompt: "fast whip pan transition with motion blur" },
    { id: "dutch-angle", label: "荷兰角", shortLabel: "荷兰角", description: "画面倾斜，营造不安氛围", prompt: "tilted dutch angle shot" },
    { id: "fpv", label: "FPV 穿越", shortLabel: "FPV 穿越", description: "穿越机第一视角高速穿行", prompt: "FPV drone fly-through shot at high speed" },
    { id: "crane-orbit", label: "升降环绕", shortLabel: "升降环绕", description: "升起同时环绕主体", prompt: "rising crane shot orbiting around the subject" },
    { id: "low-angle", label: "低角度仰拍", shortLabel: "低角度仰拍", description: "低机位仰视，突出主体气势", prompt: "low angle shot looking up at the subject" },
    { id: "birds-eye-dive", label: "鸟瞰俯冲", shortLabel: "鸟瞰俯冲", description: "高空俯瞰并向场景俯冲", prompt: "aerial bird's-eye view diving down toward the scene" },
    { id: "dolly-zoom", label: "希区柯克变焦", shortLabel: "希区柯克变焦", description: "推拉变焦，背景透视突变", prompt: "dolly zoom vertigo effect, background warping" },
    { id: "over-shoulder", label: "过肩镜头", shortLabel: "过肩镜头", description: "越过肩部看向对象", prompt: "over-the-shoulder shot" },
    { id: "pov", label: "第一人称", shortLabel: "第一人称", description: "主体视角的所见画面", prompt: "first-person POV shot" },
    { id: "rack-focus", label: "拉焦镜头", shortLabel: "拉焦镜头", description: "焦点在前后景之间转移", prompt: "rack focus shifting between foreground and background" },
    { id: "steadicam", label: "斯坦尼康", shortLabel: "斯坦尼康", description: "稳定器平滑跟随穿行", prompt: "smooth steadicam glide following the subject" },
    { id: "bullet-time", label: "子弹时间", shortLabel: "子弹时间", description: "时间近乎静止的环绕镜头", prompt: "bullet time effect, frozen moment with orbiting camera" },
];

export const CANVAS_VIDEO_CAMERA_PRESETS: CanvasVideoCameraPreset[] = VIDEO_CAMERA_SEEDS.map((seed, index) => ({
    ...seed,
    tone: seed.id ? CAMERA_TONES[(index - 1) % CAMERA_TONES.length] : "rgba(127,127,127,.08)",
}));

/** 取运镜预设对应的提示词片段；未选择或未知 id 返回空串 */
export function videoCameraPresetPrompt(id?: string) {
    if (!id) return "";
    return CANVAS_VIDEO_CAMERA_PRESETS.find((preset) => preset.id === id)?.prompt || "";
}

export type CanvasCameraOption = {
    id: string;
    label: string;
    /** 追加进图片生成提示词的英文摄影参数描述 */
    prompt: string;
};

/** 相机型号预设 */
export const CAMERA_BODY_OPTIONS: CanvasCameraOption[] = [
    { id: "", label: "不限", prompt: "" },
    { id: "full-frame-dslr", label: "全画幅单反", prompt: "shot on a full-frame DSLR camera" },
    { id: "mirrorless", label: "全画幅微单", prompt: "shot on a full-frame mirrorless camera" },
    { id: "medium-format", label: "中画幅相机", prompt: "shot on a medium format camera" },
    { id: "35mm-film", label: "35mm 胶片机", prompt: "shot on a 35mm film camera" },
    { id: "aps-c", label: "APS-C 微单", prompt: "shot on an APS-C mirrorless camera" },
    { id: "instant", label: "拍立得", prompt: "shot on an instant film camera" },
    { id: "action-cam", label: "运动相机", prompt: "shot on an action camera" },
];

/** 镜头类型预设 */
export const CAMERA_LENS_OPTIONS: CanvasCameraOption[] = [
    { id: "", label: "不限", prompt: "" },
    { id: "prime", label: "定焦镜头", prompt: "prime lens" },
    { id: "zoom-lens", label: "变焦镜头", prompt: "zoom lens" },
    { id: "macro", label: "微距镜头", prompt: "macro lens" },
    { id: "tilt-shift", label: "移轴镜头", prompt: "tilt-shift lens" },
    { id: "fisheye", label: "鱼眼镜头", prompt: "fisheye lens" },
    { id: "telephoto", label: "长焦镜头", prompt: "telephoto lens" },
    { id: "wide-angle", label: "广角镜头", prompt: "wide-angle lens" },
];

/** 焦距档位（mm） */
export const CAMERA_FOCAL_LENGTHS = ["", "14", "24", "35", "50", "85", "135", "200"] as const;

/** 光圈档位 */
export const CAMERA_APERTURES = ["", "f/1.2", "f/1.4", "f/1.8", "f/2.8", "f/4", "f/5.6", "f/8", "f/11", "f/16"] as const;

/** 图片节点摄像机控制参数（存节点 metadata，均为可空的档位值） */
export type CanvasImageCameraSettings = {
    body?: string;
    lens?: string;
    focalLength?: string;
    aperture?: string;
};

function cameraOptionPrompt(options: CanvasCameraOption[], id?: string) {
    if (!id) return "";
    return options.find((option) => option.id === id)?.prompt || "";
}

/** 把摄像机控制参数转写成提示词片段；全部未选时返回空串 */
export function buildImageCameraPrompt(settings?: CanvasImageCameraSettings | null) {
    if (!settings) return "";
    const parts = [
        cameraOptionPrompt(CAMERA_BODY_OPTIONS, settings.body),
        [
            settings.focalLength ? `${settings.focalLength}mm` : "",
            cameraOptionPrompt(CAMERA_LENS_OPTIONS, settings.lens),
        ].filter(Boolean).join(" "),
        settings.aperture ? `${settings.aperture} aperture` : "",
    ].filter(Boolean);
    return parts.join(", ");
}

/** 工具栏按钮摘要文案，如「50mm · f/1.8」；未设置时为「摄像机」 */
export function imageCameraSummaryLabel(settings?: CanvasImageCameraSettings | null) {
    if (!settings) return "摄像机";
    const parts = [
        CAMERA_BODY_OPTIONS.find((option) => option.id && option.id === settings.body)?.label,
        settings.focalLength ? `${settings.focalLength}mm` : "",
        settings.aperture || "",
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : "摄像机";
}
