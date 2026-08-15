export const WORK_CATEGORIES = ["视觉设计", "插画", "摄影", "品牌内容", "视频", "短剧", "其他"] as const;

export const WORK_CATEGORY_OPTIONS = WORK_CATEGORIES.map((value) => ({ value, label: value }));
