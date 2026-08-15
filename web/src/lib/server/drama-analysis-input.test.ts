import { describe, expect, it } from "vitest";

import { normalizeDramaVisualInput } from "./drama-analysis-input";

describe("normalizeDramaVisualInput", () => {
    it("keeps every reviewed shot, asset, utterance, relation and full text", () => {
        const longDescription = "镜头描述".repeat(2_500);
        const shots = Array.from({ length: 81 }, (_, index) => ({
            id: `shot-${index}`,
            title: `镜头 ${index}`,
            description: index === 80 ? longDescription : "描述",
            sourceText: "原文",
            duration: index === 80 ? 21 : 5,
            utterances: Array.from({ length: 101 }, (__, utteranceIndex) => ({ id: `utterance-${utteranceIndex}`, order: utteranceIndex + 1, type: "dialogue", speaker: "角色", text: `台词 ${utteranceIndex}` })),
            characterIds: Array.from({ length: 51 }, (__, relationIndex) => `character-${relationIndex}`),
            propIds: Array.from({ length: 51 }, (__, relationIndex) => `prop-${relationIndex}`),
            clueIds: Array.from({ length: 51 }, (__, relationIndex) => `clue-${relationIndex}`),
        }));
        const characters = Array.from({ length: 201 }, (_, index) => ({ id: `character-${index}`, name: `角色 ${index}`, description: index === 200 ? longDescription : "角色设定" }));

        const result = normalizeDramaVisualInput({ phase: "visual", summary: longDescription, characters, shots });

        expect(result.shotIds).toHaveLength(81);
        expect(result.payload.assets.characters).toHaveLength(201);
        expect(result.payload.shots[80]).toMatchObject({ description: longDescription, duration: 21 });
        expect(result.payload.shots[80].utterances).toHaveLength(101);
        expect(result.payload.shots[80].characterIds).toHaveLength(51);
        expect(result.payload.shots[80].propIds).toHaveLength(51);
        expect(result.payload.shots[80].clueIds).toHaveLength(51);
        expect(result.payload.project.summary).toBe(longDescription);
        expect(result.payload.assets.characters[200].description).toBe(longDescription);
    });
});
