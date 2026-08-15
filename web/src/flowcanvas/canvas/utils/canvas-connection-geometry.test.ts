import assert from "node:assert/strict";
import { test } from "vitest";

import { CanvasNodeType, type CanvasNodeData } from "../types";
import { CONNECTION_HANDLE_OFFSET, getNodeConnectionPoint } from "./canvas-connection-geometry";

const node: CanvasNodeData = {
    id: "node-1",
    type: CanvasNodeType.Text,
    title: "文本节点",
    position: { x: 100, y: 200 },
    width: 400,
    height: 240,
};

test("connection endpoints align with the external plus handles", () => {
    assert.deepEqual(getNodeConnectionPoint(node, "target"), { x: 100 - CONNECTION_HANDLE_OFFSET, y: 320 });
    assert.deepEqual(getNodeConnectionPoint(node, "source"), { x: 500 + CONNECTION_HANDLE_OFFSET, y: 320 });
});
