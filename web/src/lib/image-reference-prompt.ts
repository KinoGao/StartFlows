export function imageReferenceLabel(index: number) {
    return `图片${index + 1}`;
}

export function buildImageReferencePromptText(prompt: string, references: readonly unknown[]) {
    const text = prompt.trim();
    if (!references.length) return text;
    const labels = references.map((_, index) => imageReferenceLabel(index));
    return `Reference images: ${labels.join(", ")}. Use the reference image as real visual input, not as a text description. If a reference image contains a person or character, keep the same identity/character, face proportions, hairstyle, body shape, clothing, and main pose as much as possible. Only change the scene, style, background, or details requested by the user. Do not replace the referenced person with a new person.\n\n参考图片编号：${labels.join("、")}。如果参考图中包含人物或角色，请保持同一人物/角色、五官比例、发型、体型、服饰和主要姿态，只按用户要求修改场景、风格、背景或细节，不要换成新人物。\n\n${text}`;
}
