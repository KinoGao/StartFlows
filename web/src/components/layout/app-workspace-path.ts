export function isFullscreenWorkspacePath(pathname: string) {
    return /^\/(?:canvas|drama)\/[^/]+(?:\/|$)/.test(pathname);
}
