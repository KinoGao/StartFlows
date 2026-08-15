import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    options: {} as Record<string, unknown>,
    setGlobalDispatcher: vi.fn(),
}));

vi.mock("undici", () => ({
    ProxyAgent: class {
        constructor(options: Record<string, unknown>) {
            mocks.options = options;
        }
    },
    setGlobalDispatcher: mocks.setGlobalDispatcher,
}));

import { GENERATION_TRANSPORT_TIMEOUT_MS } from "./generation-http-lifecycle";
import { configureServerProxyDispatcher } from "./proxy-dispatcher";

describe("server proxy dispatcher", () => {
    const originalProxy = process.env.HTTPS_PROXY;

    afterEach(() => {
        if (originalProxy === undefined) delete process.env.HTTPS_PROXY;
        else process.env.HTTPS_PROXY = originalProxy;
    });

    it("does not terminate proxied generation responses at Undici's five minute default", () => {
        process.env.HTTPS_PROXY = "http://proxy.runtime.test:8080";

        configureServerProxyDispatcher();

        expect(mocks.options).toMatchObject({
            uri: "http://proxy.runtime.test:8080",
            headersTimeout: GENERATION_TRANSPORT_TIMEOUT_MS,
            bodyTimeout: GENERATION_TRANSPORT_TIMEOUT_MS,
        });
        expect(mocks.setGlobalDispatcher).toHaveBeenCalledTimes(1);
    });
});
