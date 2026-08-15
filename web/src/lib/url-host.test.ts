import { describe, expect, it } from "vitest";

import { textContainsUrlHost, urlHostHasLabel, urlHostMatches, urlPathStartsWith } from "./url-host";

describe("URL host matching", () => {
    it("matches exact hosts and real subdomains only", () => {
        expect(urlHostMatches("https://api.globalaiopc.com/v1", "globalaiopc.com")).toBe(true);
        expect(urlHostMatches("https://globalaiopc.com/v1", "globalaiopc.com")).toBe(true);
        expect(urlHostMatches("https://globalaiopc.com.evil.test/v1", "globalaiopc.com")).toBe(false);
        expect(urlHostMatches("https://evil-globalaiopc.com/v1", "globalaiopc.com")).toBe(false);
    });

    it("matches provider labels without accepting arbitrary substrings", () => {
        expect(urlHostHasLabel("https://kyyreactapiserver.example.com", "kyyreactapiserver")).toBe(true);
        expect(urlHostHasLabel("https://kyyreactapiserver-production.example.com", "kyyreactapiserver")).toBe(true);
        expect(urlHostHasLabel("https://notkyyreactapiserver.example.com", "kyyreactapiserver")).toBe(false);
    });

    it("parses URL paths and embedded URLs structurally", () => {
        expect(urlPathStartsWith("https://api.example.com/api/plan/v3/videos", "/api/plan/v3")).toBe(true);
        expect(urlPathStartsWith("https://api.example.com/prefix/api/plan/v3", "/api/plan/v3")).toBe(false);
        expect(textContainsUrlHost("curl https://api.code2alita.com/v1/images", ["code2alita.com"])).toBe(true);
        expect(textContainsUrlHost("curl https://code2alita.com.evil.test/v1/images", ["code2alita.com"])).toBe(false);
    });
});
