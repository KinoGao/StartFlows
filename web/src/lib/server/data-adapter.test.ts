import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readJsonDataFile, withJsonDataFileLock, writeJsonDataFile } from "./data-adapter";

describe("JSON data adapter", () => {
    let directory = "";

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "vozeb-data-adapter-"));
        vi.stubEnv("VOZEB_PRO_DATA_DIR", directory);
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await rm(directory, { recursive: true, force: true });
    });

    it("keeps readers on complete JSON while replacing a large file", async () => {
        await writeJsonDataFile("state.json", { version: 0, values: [] });
        const writes = Array.from({ length: 8 }, (_, version) => writeJsonDataFile("state.json", { version, values: Array.from({ length: 2_000 }, () => `value-${version}`) }));
        const reads = Array.from({ length: 40 }, () => readJsonDataFile<{ version: number; values: string[] }>("state.json", { version: -1, values: [] }));

        await expect(Promise.all([...writes, ...reads])).resolves.toHaveLength(48);
        await expect(readJsonDataFile<{ version: number }>("state.json", { version: -1 })).resolves.toEqual(expect.objectContaining({ version: expect.any(Number) }));
    });

    it("serializes locked read-modify-write sections", async () => {
        await writeJsonDataFile("counter.json", { value: 0 });
        await Promise.all(
            Array.from({ length: 6 }, () =>
                withJsonDataFileLock("counter.json", async () => {
                    const current = await readJsonDataFile("counter.json", { value: 0 });
                    await new Promise((resolve) => setTimeout(resolve, 5));
                    await writeJsonDataFile("counter.json", { value: current.value + 1 });
                }),
            ),
        );

        await expect(readJsonDataFile("counter.json", { value: 0 })).resolves.toEqual({ value: 6 });
    });
});
