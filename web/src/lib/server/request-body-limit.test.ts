import { describe, expect, it } from "vitest";

import { readRequestBodyBytes, readRequestBodyText, RequestBodyTooLargeError } from "./request-body-limit";

describe("request body limits", () => {
    it("rejects an oversized Content-Length before reading", async () => {
        const request = new Request("http://localhost", { method: "POST", headers: { "Content-Length": "11" }, body: "small" });
        await expect(readRequestBodyBytes(request, 10)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
    });

    it("rejects a chunked body after crossing the hard limit", async () => {
        const request = new Request("http://localhost", {
            method: "POST",
            body: new ReadableStream({
                start(controller) {
                    controller.enqueue(new Uint8Array(6));
                    controller.enqueue(new Uint8Array(6));
                    controller.close();
                },
            }),
            duplex: "half",
        } as RequestInit);
        await expect(readRequestBodyBytes(request, 10)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
    });

    it("reads text within the configured limit", async () => {
        await expect(readRequestBodyText(new Request("http://localhost", { method: "POST", body: "callback" }), 32)).resolves.toBe("callback");
    });
});
