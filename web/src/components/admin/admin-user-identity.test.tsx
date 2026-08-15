import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AdminAccountId } from "./admin-user-identity";

describe("AdminAccountId", () => {
    it.each([
        ["1", "0001"],
        ["9999", "9999"],
        ["10000", "10000"],
        ["100000", "100000"],
    ])("renders %s as public account ID %s", (value, expected) => {
        const markup = renderToStaticMarkup(<AdminAccountId accountId={value} />);

        expect(markup).toContain(`title="ID：${expected}"`);
        expect(markup).toContain(`>${expected}</span>`);
    });

    it("never falls back to an internal UUID", () => {
        expect(renderToStaticMarkup(<AdminAccountId accountId="c2c638ce-dfc8-4f80-a900-56bdb3c57540" />)).toBe("");
    });
});
