import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = path.join(webRoot, "src", "app", "api");

describe("API request body boundaries", () => {
    it("routes all JSON and multipart input through bounded readers", () => {
        const violations = routeFiles(apiRoot)
            .filter((file) => /request\.(?:json|formData)\s*\(/.test(readFileSync(file, "utf8")))
            .map((file) => path.relative(webRoot, file));

        expect(violations).toEqual([]);
    });
});

function routeFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) return routeFiles(target);
        return entry.isFile() && entry.name === "route.ts" ? [target] : [];
    });
}
