import { createContext, createElement, useCallback, useContext, useMemo, type ReactNode } from "react";

export interface DirectorDeskCapture {
  dataUrl: string;
  fileName: string;
}

type DirectorDeskHostContextValue = {
  sendCaptures: (captures: DirectorDeskCapture[]) => Promise<void>;
};

const DirectorDeskHostContext = createContext<DirectorDeskHostContextValue | null>(null);

export function DirectorDeskHostProvider({
  children,
  onCaptures,
}: {
  children: ReactNode;
  onCaptures: (captures: DirectorDeskCapture[]) => Promise<void>;
}) {
  const sendCaptures = useCallback(
    async (captures: DirectorDeskCapture[]) => {
      const normalizedCaptures = captures
        .map((capture, index) => ({
          dataUrl: capture.dataUrl.trim(),
          fileName: capture.fileName.trim() || `director-desk-capture-${index + 1}.png`,
        }))
        .filter((capture) => capture.dataUrl.length > 0);

      if (normalizedCaptures.length === 0) {
        throw new Error("没有可发送的导演台截图");
      }

      await onCaptures(normalizedCaptures);
    },
    [onCaptures],
  );
  const value = useMemo(() => ({ sendCaptures }), [sendCaptures]);

  return createElement(DirectorDeskHostContext.Provider, { value }, children);
}

export function useDirectorDeskHost() {
  const context = useContext(DirectorDeskHostContext);
  if (!context) {
    throw new Error("导演台未连接到画布");
  }
  return context;
}