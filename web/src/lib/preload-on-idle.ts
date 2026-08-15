export function preloadOnIdle(task: () => void) {
    const idleWindow = window as Window & {
        requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
        cancelIdleCallback?: (handle: number) => void;
    };
    const idleId = idleWindow.requestIdleCallback?.(task, { timeout: 2500 });
    if (idleId !== undefined) return () => idleWindow.cancelIdleCallback?.(idleId);
    const timer = window.setTimeout(task, 1200);
    return () => window.clearTimeout(timer);
}
