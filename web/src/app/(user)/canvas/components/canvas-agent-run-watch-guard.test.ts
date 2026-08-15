import { describe, expect, it, vi } from "vitest";

import { withCanvasAgentRunWatch } from "./canvas-agent-run-watch-guard";

describe("Canvas Agent run watch guard", () => {
    it("allows only one watcher for the same Run until it settles", async () => {
        const watching = new Set<string>();
        let finish!: () => void;
        const watch = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));

        const first = withCanvasAgentRunWatch(watching, "run", watch);
        await expect(withCanvasAgentRunWatch(watching, "run", watch)).resolves.toBe(false);
        expect(watch).toHaveBeenCalledTimes(1);

        finish();
        await expect(first).resolves.toBe(true);
        await expect(withCanvasAgentRunWatch(watching, "run", async () => undefined)).resolves.toBe(true);
    });
});
