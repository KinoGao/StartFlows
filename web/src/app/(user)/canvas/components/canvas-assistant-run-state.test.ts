import { describe, expect, it } from "vitest";

import type { CanvasAssistantSession } from "../types";
import { clearCanvasAssistantRun, findCanvasAssistantRunSession, patchCanvasAssistantRun, setCanvasAssistantRun } from "./canvas-assistant-run-state";

const planning = { key: "planning" as const, text: "正在规划" };

describe("Canvas assistant run state", () => {
    it("keeps independent runs bound to their own local sessions", () => {
        const first = setCanvasAssistantRun({}, "session-one", { runId: "run-one", assistantMessageId: "message-one", paused: false, stage: planning });
        const second = setCanvasAssistantRun(first, "session-two", { runId: "run-two", assistantMessageId: "message-two", paused: true, stage: { key: "paused", text: "已暂停" } });

        expect(second["session-one"]?.runId).toBe("run-one");
        expect(second["session-two"]?.runId).toBe("run-two");
        expect(patchCanvasAssistantRun(second, "session-one", "run-one", { paused: true })["session-one"]?.paused).toBe(true);
        expect(clearCanvasAssistantRun(second, "session-one", "run-one")).toEqual({ "session-two": second["session-two"] });
    });

    it("does not let a late watcher clear a newer run in the same session", () => {
        const current = setCanvasAssistantRun({}, "session", { runId: "new-run", assistantMessageId: "new-message", paused: false, stage: planning });
        expect(clearCanvasAssistantRun(current, "session", "old-run")).toBe(current);
        expect(patchCanvasAssistantRun(current, "session", "old-run", { paused: true })).toBe(current);
    });

    it("restores a run only through its persisted stable id", () => {
        const sessions = [
            { ...session("one", [{ id: "message-one", runId: "run-one", role: "assistant", text: "结果" }]), conversationId: "conversation-one" },
            { ...session("two", [{ id: "message-two", role: "assistant", text: "相同提示词" }]), conversationId: "conversation-two" },
        ];
        expect(findCanvasAssistantRunSession(sessions, "run-one")?.id).toBe("one");
        expect(findCanvasAssistantRunSession(sessions, "missing", "conversation-two")?.id).toBe("two");
        expect(findCanvasAssistantRunSession(sessions, "missing")).toBeUndefined();
    });
});

function session(id: string, messages: CanvasAssistantSession["messages"]): CanvasAssistantSession {
    return { id, title: id, messages, createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z" };
}
