import { describe, expect, it } from "vitest";

import { adaptGlobalAiOpcTextRequest, adaptGlobalAiOpcTextResponse, isGlobalAiOpcChannel } from "./globalaiopc-proxy";

describe("GlobalAiOpc native text proxy", () => {
    it("converts canonical Chat tool calls to Gemini native requests", () => {
        const adapted = adaptGlobalAiOpcTextRequest(
            { protocol: "globalaiopc", globalAiOpcPreset: "text-gemini-native" } as never,
            ["chat", "completions"],
            JSON.stringify({
                model: "gemini-3.1-pro-preview",
                messages: [
                    { role: "system", content: "be concise" },
                    { role: "user", content: "plan" },
                ],
                tools: [{ type: "function", function: { name: "create_plan", description: "create", parameters: { type: "object" } } }],
                tool_choice: { type: "function", function: { name: "create_plan" } },
            }),
        );

        expect(adapted).toMatchObject({ path: ["models", "gemini-3.1-pro-preview:generateContent"], adapter: "gemini" });
        expect(JSON.parse((adapted as { body: string }).body)).toMatchObject({ systemInstruction: { parts: [{ text: "be concise" }] }, tools: [{ functionDeclarations: [{ name: "create_plan" }] }] });
    });

    it("converts Claude tool responses back to the canonical Chat completion shape", () => {
        expect(adaptGlobalAiOpcTextResponse("claude", { content: [{ type: "tool_use", id: "tool-1", name: "create_plan", input: { title: "test" } }] })).toEqual({
            choices: [{ message: { role: "assistant", content: "", tool_calls: [{ id: "tool-1", type: "function", function: { name: "create_plan", arguments: '{"title":"test"}' } }] }, finish_reason: "stop" }],
        });
    });

    it("keeps native Responses as an explicit fallback so Agent can use Chat", () => {
        expect(adaptGlobalAiOpcTextRequest({ protocol: "globalaiopc", globalAiOpcPreset: "text-claude-native" } as never, ["responses"], JSON.stringify({ model: "claude-opus-4-6" }))).toBe("responses-unsupported");
        expect(isGlobalAiOpcChannel({ protocol: "globalaiopc", globalAiOpcPreset: "text-claude-native" } as never)).toBe(true);
    });
});
