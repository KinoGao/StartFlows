import type { DragEvent as ReactDragEvent } from "react";

function isFileDragEvent<T extends HTMLElement>(event: ReactDragEvent<T>) {
    return Array.from(event.dataTransfer.types || []).includes("Files");
}

export function preventFileDragEvent<T extends HTMLElement>(event: ReactDragEvent<T>) {
    if (!isFileDragEvent(event)) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
}

export function droppedFiles<T extends HTMLElement>(event: ReactDragEvent<T>, accept?: (file: File) => boolean) {
    const files = Array.from(event.dataTransfer.files || []);
    return accept ? files.filter(accept) : files;
}

export function leftDropTarget<T extends HTMLElement>(event: ReactDragEvent<T>) {
    const nextTarget = event.relatedTarget;
    return !(nextTarget instanceof Node && event.currentTarget.contains(nextTarget));
}
