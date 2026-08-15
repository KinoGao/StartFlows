import { describe, expect, it, vi } from "vitest";
import { CanvasNodeType } from "./types";
import type { CanvasAgentSnapshot } from "./utils/canvas-agent-ops";
import { executeCanvasAgentToolCall, resolveCanvasAgentConnection } from "./use-canvas-local-agent-bridge";

const snapshot: CanvasAgentSnapshot = {
    projectId: "project",
    title: "测试画布",
    nodes: [{ id: "one", type: CanvasNodeType.Text, title: "节点", position: { x: 0, y: 0 }, width: 320, height: 220, metadata: { content: "内容" } }],
    connections: [],
    selectedNodeIds: ["one"],
    viewport: { x: 0, y: 0, k: 1 },
};

describe("Canvas local agent bridge", () => {
    it("accepts only loopback HTTP endpoints with a bounded token", () => {
        expect(resolveCanvasAgentConnection("?agentUrl=http%3A%2F%2F127.0.0.1%3A17371&agentToken=1234567890abcdef")).toEqual({ endpoint: "http://127.0.0.1:17371", token: "1234567890abcdef" });
        expect(resolveCanvasAgentConnection("?agentUrl=http%3A%2F%2F%5B%3A%3A1%5D%3A17371&agentToken=1234567890abcdef")).toEqual({ endpoint: "http://[::1]:17371", token: "1234567890abcdef" });
        expect(resolveCanvasAgentConnection("?agentUrl=https%3A%2F%2Fevil.example.com&agentToken=1234567890abcdef")).toBeNull();
        expect(resolveCanvasAgentConnection("?agentUrl=http%3A%2F%2Flocalhost%3A17371&agentToken=short")).toBeNull();
    });

    it("returns selection without applying mutations", async () => {
        const applyOps = vi.fn();
        const result = await executeCanvasAgentToolCall({ requestId: "read", name: "canvas_get_selection" }, snapshot, applyOps, vi.fn());
        expect(result).toEqual({ nodes: [snapshot.nodes[0]] });
        expect(applyOps).not.toHaveBeenCalled();
    });

    it("requires confirmation before applying write operations", async () => {
        const next = { ...snapshot, selectedNodeIds: [] };
        const applyOps = vi.fn(() => next);
        const ops = [{ type: "select_nodes" as const, ids: [] }];
        await expect(
            executeCanvasAgentToolCall(
                { requestId: "write", name: "canvas_apply_ops", input: { ops } },
                snapshot,
                applyOps,
                vi.fn(async () => false),
            ),
        ).rejects.toThrow("用户拒绝");
        await expect(
            executeCanvasAgentToolCall(
                { requestId: "write", name: "canvas_apply_ops", input: { ops } },
                snapshot,
                applyOps,
                vi.fn(async () => true),
            ),
        ).resolves.toBe(next);
        expect(applyOps).toHaveBeenCalledTimes(1);
    });
});
