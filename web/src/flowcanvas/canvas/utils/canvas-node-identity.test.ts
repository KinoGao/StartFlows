import assert from "node:assert/strict";
import { test } from "vitest";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";
import {
    allocateCanvasNodeIdentity,
    normalizeCanvasConnectionOrders,
    normalizeCanvasNodeIdentities,
    sortConnectionsByReferenceOrder,
} from "./canvas-node-identity";

function node(id: string, type: CanvasNodeData["type"], title: string, typeSequence?: number): CanvasNodeData {
    return {
        id,
        type,
        title,
        position: { x: 0, y: 0 },
        width: 160,
        height: 120,
        metadata: typeSequence ? { typeSequence } : undefined,
    };
}

test("allocates persistent type-specific titles without replacing custom titles", () => {
    const result = normalizeCanvasNodeIdentities(
        [
            node("text-legacy", CanvasNodeType.Text, "Note"),
            node("image-custom", CanvasNodeType.Image, "Mood board"),
            node("text-legacy-2", CanvasNodeType.Text, ""),
        ],
        { text: 3 },
    );

    assert.deepEqual(
        result.nodes.map((item) => [item.title, item.metadata?.typeSequence]),
        [
            ["文本节点 4", 4],
            ["Mood board", 1],
            ["文本节点 5", 5],
        ],
    );
    assert.deepEqual(result.nodeSequenceCounters, { text: 5, image: 1 });
});

test("preserves explicit connection order and assigns a stable order to legacy edges", () => {
    const result = normalizeCanvasConnectionOrders(
        [
            { id: "later", fromNodeId: "image", toNodeId: "target", referenceOrder: 2 },
            { id: "legacy", fromNodeId: "text", toNodeId: "target" },
            { id: "first", fromNodeId: "video", toNodeId: "target", referenceOrder: 1 },
        ] satisfies CanvasConnection[],
        2,
    );

    assert.deepEqual(result.connections.map((connection) => [connection.id, connection.referenceOrder]), [
        ["later", 2],
        ["legacy", 3],
        ["first", 1],
    ]);
    assert.deepEqual(sortConnectionsByReferenceOrder(result.connections).map((connection) => connection.id), ["first", "later", "legacy"]);
    assert.equal(result.referenceOrderCounter, 3);
});

test("allocates the next title from persisted counters instead of the live node count", () => {
    const result = allocateCanvasNodeIdentity(CanvasNodeType.ComfyUI, { comfyui: 4, text: 9 });

    assert.deepEqual(result, {
        title: "ComfyUI节点 5",
        typeSequence: 5,
        nodeSequenceCounters: { comfyui: 5, text: 9 },
    });
});

test("migrates generated placeholder titles to the type sequence default", () => {
    const result = normalizeCanvasNodeIdentities([
        node("image-generated", CanvasNodeType.Image, "Generated Image"),
        node("video-generated", CanvasNodeType.Video, "Generated Video"),
    ]);

    assert.deepEqual(
        result.nodes.map((item) => [item.title, item.metadata?.typeSequence]),
        [
            ["图片节点 1", 1],
            ["视频节点 1", 1],
        ],
    );
});
