import directorStyles from "./styles/inline-css";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { DirectorDeskShell } from "./app/layout/DirectorDeskShell";
import { DirectorCanvas } from "./editor/canvas/DirectorCanvas";
import { DirectorDeskHostProvider, type DirectorDeskCapture } from "./editor/io/hostBridge";
import type { DirectorProject } from "./editor/schema/directorProject";
import { useDirectorStore } from "./editor/store/directorStore";

export interface StoryAiDirectorDeskProps {
  nodeId: string;
  initialProject?: DirectorProject;
  theme: "light" | "dark";
  onProjectChange: (project: DirectorProject) => void;
  onCaptures: (captures: DirectorDeskCapture[]) => Promise<void>;
  onClose: () => void;
}

const isolatedDirectorStyles = directorStyles
  .replaceAll(":root[data-theme=\"dark\"]", ":host([data-theme=\"dark\"])")
  .replaceAll(":root.dark", ":host(.dark)")
  .replace(/^:root\s*\{/m, ":host {")
  .concat(`
:host {
  position: fixed;
  inset: 0;
  z-index: 220;
  display: block;
  overflow: hidden;
  contain: strict;
}
.app-shell {
  min-height: 0;
  background: rgb(var(--bg-rgb));
}
.top-bar {
  min-height: 58px;
  border-width: 0 0 1px;
  background: rgb(var(--panel-rgb) / 0.86);
  backdrop-filter: saturate(1.35) blur(22px);
  -webkit-backdrop-filter: saturate(1.35) blur(22px);
}
.top-bar-action-button {
  border-color: transparent;
  background: rgb(var(--surface-rgb) / 0.68);
}
.ui-panel,
.panel-card {
  border-radius: 12px;
  box-shadow: 0 12px 36px rgb(var(--overlay-rgb) / 0.18);
}
.director-sidebar {
  backdrop-filter: saturate(1.2) blur(18px);
  -webkit-backdrop-filter: saturate(1.2) blur(18px);
}
`);

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function DirectorDeskContent({
  nodeId,
  initialProject,
  onProjectChange,
  onCaptures,
  onClose,
}: Omit<StoryAiDirectorDeskProps, "theme">) {
  const viewMode = useDirectorStore((state) => state.viewMode);
  const setViewMode = useDirectorStore((state) => state.setViewMode);
  const initialProjectRef = useRef(initialProject);
  const onProjectChangeRef = useRef(onProjectChange);
  const pendingProjectRef = useRef<DirectorProject | null>(null);

  initialProjectRef.current = initialProject;
  onProjectChangeRef.current = onProjectChange;

  useEffect(() => {
    const store = useDirectorStore.getState();
    store.openScopedScene(nodeId);
    if (initialProjectRef.current) {
      store.replaceProject(initialProjectRef.current);
    } else {
      onProjectChangeRef.current(useDirectorStore.getState().project);
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      if (!pendingProjectRef.current) return;
      const project = pendingProjectRef.current;
      pendingProjectRef.current = null;
      onProjectChangeRef.current(project);
    };
    const unsubscribe = useDirectorStore.subscribe((state, previousState) => {
      if (state.project === previousState.project) return;
      pendingProjectRef.current = state.project;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, 120);
    });


    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      flush();
    };
  }, [nodeId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableShortcutTarget(event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        useDirectorStore.getState().deleteSelectedObject();
        return;
      }
      if (!event.metaKey && !event.ctrlKey) return;

      const key = event.key.toLowerCase();
      if (key === "c") {
        event.preventDefault();
        useDirectorStore.getState().copySelectedObjects();
      } else if (key === "v") {
        event.preventDefault();
        useDirectorStore.getState().pasteClipboardObjects();
      } else if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        useDirectorStore.getState().undo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-left">
          <h1 className="top-bar-title">3D 导演台</h1>
        </div>
        <div className="top-bar-center">
          <div className="mode-toggle ui-segmented" role="group" aria-label="视角切换">
            <button
              className={`mode-toggle-button ui-segmented-item ${viewMode === "director" ? "ui-segmented-item-active" : ""}`}
              aria-pressed={viewMode === "director"}
              type="button"
              onClick={() => setViewMode("director")}
            >
              导演视角
            </button>
            <button
              className={`mode-toggle-button ui-segmented-item ${viewMode === "camera" ? "ui-segmented-item-active" : ""}`}
              aria-pressed={viewMode === "camera"}
              type="button"
              onClick={() => setViewMode("camera")}
            >
              机位视角
            </button>
          </div>
        </div>
        <div className="top-bar-actions">
          <button className="top-bar-action-button" type="button" aria-label="关闭导演台" title="关闭" onClick={onClose}>
            <X aria-hidden="true" size={17} strokeWidth={1.8} />
          </button>
        </div>
      </header>
      <DirectorDeskHostProvider onCaptures={onCaptures}>
        <DirectorDeskShell>
          <DirectorCanvas />
        </DirectorDeskShell>
      </DirectorDeskHostProvider>
    </div>
  );
}

function ShadowPortal({ children, theme }: { children: ReactNode; theme: "light" | "dark" }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    setShadowRoot(root);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.dataset.theme = theme;
    host.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <div
      ref={hostRef}
      data-canvas-no-zoom
      style={{ position: "fixed", inset: 0, zIndex: 220 }}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      {shadowRoot ? createPortal(<><style>{isolatedDirectorStyles}</style>{children}</>, shadowRoot) : null}
    </div>
  );
}

export type { DirectorDeskCapture } from "./editor/io/hostBridge";

export function StoryAiDirectorDesk(props: StoryAiDirectorDeskProps) {
  return (
    <ShadowPortal theme={props.theme}>
      <DirectorDeskContent
        nodeId={props.nodeId}
        initialProject={props.initialProject}
        onProjectChange={props.onProjectChange}
        onCaptures={props.onCaptures}
        onClose={props.onClose}
      />
    </ShadowPortal>
  );
}