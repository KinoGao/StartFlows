"use client";

import React from "react";

type CanvasScaleRef = { current: number };

/** A stable ref object whose `.current` is always the latest canvas scale.
 *  Reading it never triggers a React re-render. */
export const CanvasScaleCtx = React.createContext<CanvasScaleRef>({ current: 1 });

export function useCanvasScaleRef() {
    return React.useContext(CanvasScaleCtx);
}

export function useCanvasScale(): number {
    return useCanvasScaleRef().current;
}
