import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import { fetchInternalApi } from "./internal-origin";

describe("internal API transport", () => {
    it("serializes native FormData as multipart for undici", async () => {
        let contentType = "";
        let receivedBody = "";
        const server = createServer(async (request, response) => {
            contentType = request.headers["content-type"] || "";
            const chunks: Buffer[] = [];
            for await (const chunk of request) chunks.push(Buffer.from(chunk));
            receivedBody = Buffer.concat(chunks).toString("utf8");
            response.end("ok");
        });
        await listen(server);
        const port = (server.address() as AddressInfo).port;
        const form = new FormData();
        form.set("model", "e2e-video-slow");
        form.set("input_reference", new File([new Uint8Array([1, 2, 3])], "reference.png", { type: "image/png" }));
        try {
            const response = await fetchInternalApi(`http://127.0.0.1:${port}/videos`, { method: "POST", body: form });
            expect(response.status).toBe(200);
            expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
            expect(receivedBody).toContain('name="model"');
            expect(receivedBody).toContain("e2e-video-slow");
            expect(receivedBody).toContain('name="input_reference"; filename="reference.png"');
        } finally {
            await close(server);
        }
    });
});

function listen(server: ReturnType<typeof createServer>) {
    return new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => resolve());
    });
}

function close(server: ReturnType<typeof createServer>) {
    return new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
