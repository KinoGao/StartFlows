type MentionKeyEvent = { key: string; preventDefault: () => void };

export function handleMentionNavigation<T>(event: MentionKeyEvent, candidates: T[], activeIndex: number, setActiveIndex: (update: (index: number) => number) => void, onSelect: (candidate: T) => void, onClose: () => void) {
    if (!candidates.length) return false;
    if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % candidates.length);
        return true;
    }
    if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + candidates.length) % candidates.length);
        return true;
    }
    if (event.key === "Enter") {
        event.preventDefault();
        onSelect(candidates[Math.min(activeIndex, candidates.length - 1)]);
        return true;
    }
    if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return true;
    }
    return false;
}
