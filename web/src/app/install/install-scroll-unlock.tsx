"use client";

import { useEffect } from "react";

export function InstallScrollUnlock() {
    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;
        const previous = {
            htmlHeight: html.style.height,
            htmlOverflowX: html.style.overflowX,
            htmlOverflowY: html.style.overflowY,
            bodyHeight: body.style.height,
            bodyOverflowX: body.style.overflowX,
            bodyOverflowY: body.style.overflowY,
        };

        html.style.height = "auto";
        html.style.overflowX = "hidden";
        html.style.overflowY = "auto";
        body.style.height = "auto";
        body.style.overflowX = "hidden";
        body.style.overflowY = "auto";

        return () => {
            html.style.height = previous.htmlHeight;
            html.style.overflowX = previous.htmlOverflowX;
            html.style.overflowY = previous.htmlOverflowY;
            body.style.height = previous.bodyHeight;
            body.style.overflowX = previous.bodyOverflowX;
            body.style.overflowY = previous.bodyOverflowY;
        };
    }, []);

    return null;
}
