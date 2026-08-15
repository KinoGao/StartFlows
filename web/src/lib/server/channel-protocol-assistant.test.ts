import { describe, expect, it } from "vitest";

import { htmlDocumentText } from "./channel-protocol-assistant";

describe("channel protocol document parsing", () => {
    it("keeps visible HTML text and removes executable or hidden blocks", () => {
        const text = htmlDocumentText('<main>API <strong>/v1/models</strong><script src="x">secret()</script><style>.hidden{}</style><template>hidden</template><p>&amp; ready</p></main>');

        expect(text).toBe("API /v1/models & ready");
        expect(text).not.toContain("secret");
        expect(text).not.toContain("hidden");
    });

    it("handles malformed HTML without leaking script contents", () => {
        expect(htmlDocumentText("<p>before<script>secret()<p>after")).toBe("before");
    });
});
