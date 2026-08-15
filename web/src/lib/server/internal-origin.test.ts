import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ agentOptions: {} as Record<string, unknown> }));

vi.mock("undici", () => ({
    Agent: class {
        constructor(options: Record<string, unknown>) {
            mocks.agentOptions = options;
        }
    },
    fetch: vi.fn(),
}));

import { GENERATION_TRANSPORT_TIMEOUT_MS } from "./generation-http-lifecycle";
import "./internal-origin";

describe("internal API dispatcher", () => {
    it("outlives the longest model request instead of using Undici's five minute default", () => {
        expect(mocks.agentOptions).toMatchObject({
            headersTimeout: GENERATION_TRANSPORT_TIMEOUT_MS,
            bodyTimeout: GENERATION_TRANSPORT_TIMEOUT_MS,
        });
    });
});
