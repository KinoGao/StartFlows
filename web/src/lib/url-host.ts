export function urlHostname(value: string) {
    try {
        return new URL(value).hostname.toLowerCase();
    } catch {
        return "";
    }
}

export function urlHostMatches(value: string, expectedHostname: string) {
    const hostname = urlHostname(value);
    const expected = expectedHostname.trim().toLowerCase();
    return Boolean(hostname && expected && (hostname === expected || hostname.endsWith(`.${expected}`)));
}

export function urlHostHasLabel(value: string, expectedLabel: string) {
    const expected = expectedLabel.trim().toLowerCase();
    return Boolean(
        expected &&
        urlHostname(value)
            .split(".")
            .some((label) => label === expected || label.startsWith(`${expected}-`)),
    );
}

export function urlPathStartsWith(value: string, expectedPath: string) {
    try {
        const path = new URL(value).pathname.toLowerCase();
        const expected = expectedPath.trim().toLowerCase();
        return Boolean(expected && (path === expected || path.startsWith(`${expected}/`)));
    } catch {
        return false;
    }
}

export function textContainsUrlHost(value: string, expectedHostnames: string[]) {
    const urls = value.match(/https?:\/\/[^\s"'`<>()\[\]{}]+/gi) || [];
    return urls.some((url) => expectedHostnames.some((hostname) => urlHostMatches(url, hostname)));
}
