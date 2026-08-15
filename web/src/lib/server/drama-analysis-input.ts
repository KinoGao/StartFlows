import { resolveDramaShotDuration } from "@/lib/server/drama-shot-config";

export type DramaAnalyzeBody = {
    phase?: "content" | "visual";
    script?: string;
    summary?: string;
    style?: string;
    episode?: unknown;
    characters?: unknown;
    scenes?: unknown;
    props?: unknown;
    clues?: unknown;
    shots?: unknown;
};

export function dramaAnalysisText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

export function normalizeDramaVisualInput(body: DramaAnalyzeBody) {
    const shots = array(body.shots).flatMap((value) => {
        const shot = object(value);
        const id = dramaAnalysisText(shot.id);
        if (!id) return [];
        return [
            {
                id,
                title: dramaAnalysisText(shot.title),
                description: dramaAnalysisText(shot.description),
                sourceText: dramaAnalysisText(shot.sourceText),
                shotBoundary: dramaAnalysisText(shot.shotBoundary),
                dialogue: dramaAnalysisText(shot.dialogue),
                narration: dramaAnalysisText(shot.narration),
                utterances: normalizeUtterances(shot.utterances),
                duration: resolveDramaShotDuration(shot.duration, 5),
                characterIds: texts(shot.characterIds),
                sceneId: dramaAnalysisText(shot.sceneId),
                propIds: texts(shot.propIds),
                clueIds: texts(shot.clueIds),
            },
        ];
    });
    return {
        shotIds: shots.map((shot) => shot.id),
        payload: {
            project: { summary: dramaAnalysisText(body.summary), style: dramaAnalysisText(body.style) },
            episode: object(body.episode),
            assets: {
                characters: normalizeVisualAssets(body.characters),
                scenes: normalizeVisualAssets(body.scenes),
                props: normalizeVisualAssets(body.props),
                clues: normalizeVisualAssets(body.clues),
            },
            shots,
        },
    };
}

function normalizeVisualAssets(value: unknown) {
    return array(value).flatMap((item) => {
        const asset = object(item);
        const name = dramaAnalysisText(asset.name);
        if (!name) return [];
        const profile = object(asset.profile);
        return [
            {
                id: dramaAnalysisText(asset.id),
                name,
                description: dramaAnalysisText(asset.description),
                profile: {
                    visualIdentity: dramaAnalysisText(profile.visualIdentity),
                    styling: dramaAnalysisText(profile.styling),
                    colorPalette: dramaAnalysisText(profile.colorPalette),
                    consistencyRules: dramaAnalysisText(profile.consistencyRules),
                },
                payoff: dramaAnalysisText(asset.payoff),
            },
        ];
    });
}

function normalizeUtterances(value: unknown) {
    return array(value).flatMap((item, index) => {
        const utterance = object(item);
        const text = dramaAnalysisText(utterance.text);
        if (!text) return [];
        return [
            {
                id: dramaAnalysisText(utterance.id),
                order: Math.max(1, Math.floor(Number(utterance.order) || index + 1)),
                type: utterance.type === "voiceover" ? "voiceover" : "dialogue",
                speaker: dramaAnalysisText(utterance.speaker),
                text,
            },
        ];
    });
}

function texts(value: unknown) {
    return array(value).map(dramaAnalysisText).filter(Boolean);
}

function object(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}
