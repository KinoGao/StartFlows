import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    retry: vi.fn(),
    watch: vi.fn(),
}));

vi.mock("@/services/api/creative", () => ({ retryCreativeAgentTask: mocks.retry }));
vi.mock("./canvas-agent-run-client", () => ({ watchCanvasAgentRun: mocks.watch }));

import { CanvasNodeType, type CanvasNodeData } from "../types";
import { retryCanvasAgentNode } from "./canvas-agent-node-retry";

describe("Canvas Agent node retry", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.retry.mockResolvedValue({});
        mocks.watch.mockImplementation(async (_runId, handlers) => {
            handlers.onOps([{ type: "update_node", id: "output-run-0-0", metadata: { status: "loading" } }]);
            handlers.onOps([{ type: "update_node", id: "output-run-0-0", metadata: { status: "success" } }]);
        });
    });

    it("retries the persisted Agent task and updates the same output node", async () => {
        const applyOps = vi.fn();

        await expect(retryCanvasAgentNode(node(), applyOps)).resolves.toBe(true);

        expect(mocks.retry).toHaveBeenCalledWith("run", "task");
        expect(applyOps).toHaveBeenNthCalledWith(1, [{ type: "update_node", id: "output-run-0-0", metadata: { status: "loading" } }]);
        expect(applyOps).toHaveBeenNthCalledWith(2, [{ type: "update_node", id: "output-run-0-0", metadata: { status: "success" } }]);
    });

    it("leaves ordinary Canvas nodes to the existing retry flow", async () => {
        await expect(retryCanvasAgentNode({ ...node(), metadata: { status: "error" } }, vi.fn())).resolves.toBe(false);
        expect(mocks.retry).not.toHaveBeenCalled();
        expect(mocks.watch).not.toHaveBeenCalled();
    });
});

function node(): CanvasNodeData {
    return {
        id: "output-run-0-0",
        type: CanvasNodeType.Image,
        title: "Agent 图片",
        position: { x: 0, y: 0 },
        width: 340,
        height: 240,
        metadata: { status: "error", agentRunId: "run", agentTaskId: "task", agentTaskType: "image" },
    };
}
