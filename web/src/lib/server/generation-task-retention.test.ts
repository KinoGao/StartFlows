import { describe, expect, it } from "vitest";

import { GENERATION_TASK_RETENTION_MS } from "./generation-task-retention";

describe("generation task retention", () => {
    it("keeps recoverable tasks well beyond the former one-hour boundary", () => {
        expect(GENERATION_TASK_RETENTION_MS).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000);
    });
});
