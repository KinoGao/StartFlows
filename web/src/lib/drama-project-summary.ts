import type { DramaProject, DramaProjectSummary, DramaShot } from "@/lib/drama-project-contract";

export function summarizeDramaProject(project: DramaProject): DramaProjectSummary {
    const shots = project.episodes.flatMap((episode) => episode.shots);
    return {
        id: project.id,
        title: project.title,
        summary: project.summary,
        style: project.style,
        ratio: project.ratio,
        status: project.status,
        episodeCount: project.episodes.length,
        characterCount: project.characters.length,
        sceneCount: project.scenes.length,
        shotCount: shots.length,
        pendingTaskCount: shots.filter(hasPendingTask).length,
        failedTaskCount: shots.filter(hasFailedTask).length,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
    };
}

function hasPendingTask(shot: DramaShot) {
    return [shot.storyboardStatus, shot.storyboardEndStatus, shot.generationStatus, shot.audioStatus].some((status) => status === "queued" || status === "running");
}

function hasFailedTask(shot: DramaShot) {
    return [shot.storyboardStatus, shot.storyboardEndStatus, shot.generationStatus, shot.audioStatus].some((status) => status === "error");
}
