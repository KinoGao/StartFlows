import { describe, expect, it } from "vitest";
import { applyCanvasAgentOps, findFreeNodePosition, type CanvasAgentSnapshot } from "./canvas-agent-ops";
import { CanvasNodeType } from "../types";

const snapshot: CanvasAgentSnapshot = { projectId: "p", title: "画布", nodes: [], connections: [], selectedNodeIds: [], viewport: { x: 0, y: 0, k: 1 } };

describe("Agent 产物排版", () => {
    it("keeps the current selection while stable loading nodes are planned and replayed", () => {
        const selected: CanvasAgentSnapshot = {
            ...snapshot,
            nodes: [{ id: "reference", type: CanvasNodeType.Image, title: "参考图", position: { x: 0, y: 0 }, width: 340, height: 240, metadata: { status: "success" } }],
            selectedNodeIds: ["reference"],
        };
        const ops = [
            { type: "add_node" as const, id: "output-run-0-0", nodeType: CanvasNodeType.Image, position: { x: 400, y: 0 }, metadata: { agentRunId: "run", agentTaskId: "task", status: "loading" as const, size: "16:9" } },
            { type: "update_node" as const, id: "output-run-0-0", metadata: { status: "success" as const, naturalWidth: 1600, naturalHeight: 900 } },
        ];

        const first = applyCanvasAgentOps(selected, ops);
        const replay = applyCanvasAgentOps(first, ops);

        expect(first.selectedNodeIds).toEqual(["reference"]);
        expect(replay.nodes.filter((node) => node.id === "output-run-0-0")).toHaveLength(1);
        expect(replay.nodes.find((node) => node.id === "output-run-0-0")).toMatchObject({ width: 340, height: 191.25, metadata: { status: "success", naturalWidth: 1600, naturalHeight: 900 } });
    });

    it("places every Agent Run node in a free position and replays stable ids idempotently", () => {
        const occupied: CanvasAgentSnapshot = {
            ...snapshot,
            nodes: [{ id: "existing", type: CanvasNodeType.Image, title: "已有节点", position: { x: 900, y: 0 }, width: 340, height: 340 }],
        };
        const first = applyCanvasAgentOps(occupied, [
            { type: "add_node", id: "brief-run", nodeType: CanvasNodeType.Brief, position: { x: 900, y: 0 }, metadata: { agentRunId: "run" } },
            { type: "add_node", id: "task-run-0", nodeType: CanvasNodeType.Task, position: { x: 900, y: 0 }, metadata: { agentRunId: "run" } },
        ]);
        expect(first.nodes).toHaveLength(3);
        expect(first.nodes[1].position).not.toEqual(occupied.nodes[0].position);
        expect(first.nodes[2].position).not.toEqual(occupied.nodes[0].position);
        expect(first.nodes[1].position).not.toEqual(first.nodes[2].position);

        const replay = applyCanvasAgentOps(first, [{ type: "add_node", id: "brief-run", nodeType: CanvasNodeType.Brief, title: "已更新", metadata: { agentRunId: "run" } }]);
        expect(replay.nodes).toHaveLength(3);
        expect(replay.nodes[1].title).toBe("已更新");
    });

    it.each([CanvasNodeType.Image, CanvasNodeType.Video])("keeps completed Agent %s media clear when its real aspect ratio changes the node bounds", (nodeType) => {
        const occupied: CanvasAgentSnapshot = {
            ...snapshot,
            nodes: [{ id: "existing", type: CanvasNodeType.Image, title: "已有节点", position: { x: 400, y: 240 }, width: 340, height: 180 }],
        };
        const completed = applyCanvasAgentOps(occupied, [
            { type: "add_node", id: "output-run-0-0", nodeType, position: { x: 400, y: 0 }, metadata: { agentRunId: "run", size: "16:9", status: "loading" } },
            { type: "update_node", id: "output-run-0-0", metadata: { agentRunId: "run", naturalWidth: 900, naturalHeight: 1600, status: "success" } },
        ]);
        const output = completed.nodes.find((node) => node.id === "output-run-0-0")!;

        expect(output.position.x).toBeGreaterThanOrEqual(776);
    });

    it("finds a guaranteed free position without a fixed candidate limit", () => {
        const occupied = [{ id: "wall", type: CanvasNodeType.Image, title: "超大已有节点", position: { x: 0, y: 0 }, width: 5000, height: 20000 }] as CanvasAgentSnapshot["nodes"];

        expect(findFreeNodePosition(occupied, { x: 0, y: 0 }, 340, 340)).toEqual({ x: 5036, y: 0 });
    });

    it("keeps manually added nodes at their requested position", () => {
        const occupied: CanvasAgentSnapshot = {
            ...snapshot,
            nodes: [{ id: "existing", type: CanvasNodeType.Image, title: "已有节点", position: { x: 20, y: 30 }, width: 340, height: 340 }],
        };
        const created = applyCanvasAgentOps(occupied, [{ type: "add_node", id: "manual", nodeType: CanvasNodeType.Text, position: { x: 20, y: 30 } }]);

        expect(created.nodes[1].position).toEqual({ x: 20, y: 30 });
    });

    it("sizes image outputs from their natural dimensions", () => {
        const created = applyCanvasAgentOps(snapshot, [
            { type: "add_node", id: "output-agent-run-0-0", nodeType: CanvasNodeType.Image, position: { x: 400, y: 20 }, metadata: { agentRunId: "run", content: "/image.png", naturalWidth: 1024, naturalHeight: 1024 } },
        ]);

        expect(created.nodes[0]).toMatchObject({ width: 340, height: 340, metadata: { naturalWidth: 1024, naturalHeight: 1024 } });
    });

    it("uses the requested image ratio before natural dimensions are available", () => {
        const created = applyCanvasAgentOps(snapshot, [{ type: "add_node", id: "output-agent-run-0-0", nodeType: CanvasNodeType.Image, position: { x: 400, y: 20 }, metadata: { agentRunId: "run", content: "/image.png", size: "1:1" } }]);

        expect(created.nodes[0]).toMatchObject({ width: 340, height: 340 });
    });

    it("applies node, connection, selection, movement, resize, viewport, and delete ops", () => {
        const created = applyCanvasAgentOps(snapshot, [
            { type: "add_node", id: "one", nodeType: CanvasNodeType.Text, position: { x: 10, y: 20 } },
            { type: "add_node", id: "two", nodeType: CanvasNodeType.Image, position: { x: 400, y: 20 } },
            { type: "connect_nodes", id: "edge", fromNodeId: "one", toNodeId: "two" },
            { type: "connect_nodes", id: "duplicate", fromNodeId: "one", toNodeId: "two" },
            { type: "update_node", id: "one", patch: { position: { x: 80, y: 90 }, width: 520, height: 260 }, metadata: { content: "已更新" } },
            { type: "select_nodes", ids: ["one", "missing"] },
            { type: "set_viewport", viewport: { x: 120, y: 60, k: 1.5 } },
        ]);

        expect(created.nodes.find((node) => node.id === "one")).toMatchObject({ position: { x: 80, y: 90 }, width: 520, height: 260, metadata: { content: "已更新" } });
        expect(created.connections).toEqual([{ id: "edge", fromNodeId: "one", toNodeId: "two" }]);
        expect(created.selectedNodeIds).toEqual(["one"]);
        expect(created.viewport).toEqual({ x: 120, y: 60, k: 1.5 });

        const deleted = applyCanvasAgentOps(created, [{ type: "delete_node", id: "one" }]);
        expect(deleted.nodes.map((node) => node.id)).toEqual(["two"]);
        expect(deleted.connections).toEqual([]);
        expect(deleted.selectedNodeIds).toEqual([]);
    });
});
