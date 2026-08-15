"use client";

import { useState } from "react";

import { PublicCreatorProfile } from "@/components/works/public-creator-profile";
import { PublicWorkPreviewModal } from "@/components/works/public-work-preview-modal";
import type { PublicCreatorPage } from "@/services/api/work-community";

export function PublicCreatorView({ initialData }: { initialData: PublicCreatorPage }) {
    const [previewSlug, setPreviewSlug] = useState("");
    const profilePath = `/u/${encodeURIComponent(initialData.profile.username)}`;

    return (
        <>
            <PublicCreatorProfile initialData={initialData} nextPath={profilePath} onOpenWork={setPreviewSlug} />
            <PublicWorkPreviewModal slug={previewSlug || undefined} onClose={() => setPreviewSlug("")} />
        </>
    );
}
