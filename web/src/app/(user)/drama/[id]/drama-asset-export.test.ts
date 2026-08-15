import { unzipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DramaProject } from "@/lib/drama-project-contract";
import { downloadDramaAssetBundle } from "./drama-asset-export";

const { saveAs } = vi.hoisted(() => ({ saveAs: vi.fn() }));
vi.mock("file-saver", () => ({ saveAs }));

function projectFixture(): DramaProject {
    return {
        id: "drama-export",
        title: "长安",
        summary: "",
        style: "",
        ratio: "16:9",
        status: "active",
        characters: [
            {
                id: "character-zhao",
                name: "赵徽",
                description: "主角",
                references: [{ id: "reference-zhao", url: "/api/reference-assets/zhao.png", source: "upload", label: "基准图", createdAt: "2026-01-01T00:00:00.000Z" }],
                primaryReferenceId: "reference-zhao",
            },
            { id: "character-missing", name: "孟婆", description: "配角" },
        ],
        scenes: [],
        props: [],
        clues: [],
        defaultVideoMode: "direct",
        episodes: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}

afterEach(() => {
    vi.restoreAllMocks();
    saveAs.mockReset();
});

describe("drama asset export", () => {
    it("packs real primary references and records missing assets", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Content-Type": "image/png" } })));

        const result = await downloadDramaAssetBundle(projectFixture());

        expect(result).toEqual({ exported: 1, skipped: 1, total: 2 });
        expect(saveAs).toHaveBeenCalledTimes(1);
        const zip = saveAs.mock.calls[0]?.[0] as Blob;
        const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()));
        expect(Object.keys(entries)).toEqual(expect.arrayContaining(["asset-manifest.json", expect.stringContaining("角色/赵徽-character-zhao.png")]));
        expect(new TextDecoder().decode(entries["asset-manifest.json"])).toContain('"status": "missing"');
    });

    it("does not create a download when every asset is missing a primary reference", async () => {
        vi.stubGlobal("fetch", vi.fn());

        const result = await downloadDramaAssetBundle({ ...projectFixture(), characters: [{ id: "character-missing", name: "孟婆", description: "配角" }] });

        expect(result).toEqual({ exported: 0, skipped: 1, total: 1 });
        expect(fetch).not.toHaveBeenCalled();
        expect(saveAs).not.toHaveBeenCalled();
    });
});
