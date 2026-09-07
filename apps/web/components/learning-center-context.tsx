"use client";

import dynamic from "next/dynamic";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface LearningCenterContextValue {
  openLearningCenter: (resourceId?: string) => void;
  closeLearningCenter: () => void;
  isOpen: boolean;
}
const LearningCenterContext = createContext<LearningCenterContextValue | null>(
  null,
);
const LearningCenterDrawer = dynamic(
  () =>
    import("./learning-center").then((module) => module.LearningCenterDrawer),
  {
    loading: () => <LearningLoading />,
  },
);

function LearningLoading() {
  const { closeLearningCenter } = useLearningCenter();
  return (
    <div
      className="learning-layer"
      role="presentation"
      onMouseDown={closeLearningCenter}
    >
      <aside
        className="learning-center"
        role="dialog"
        aria-modal="true"
        aria-label="Learning Center"
        aria-busy="true"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") closeLearningCenter();
        }}
      >
        <header className="learning-header">
          <strong>Learning Center</strong>
          <button type="button" onClick={closeLearningCenter}>
            Close
          </button>
        </header>
        <p role="status">Loading learning resources…</p>
      </aside>
    </div>
  );
}

export function LearningCenterProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const openLearningCenter = useCallback((resourceId?: string) => {
    setSelectedId(resourceId ?? null);
    setOpen(true);
  }, []);
  const closeLearningCenter = useCallback(() => setOpen(false), []);
  const value = useMemo(
    () => ({ openLearningCenter, closeLearningCenter, isOpen: open }),
    [openLearningCenter, closeLearningCenter, open],
  );
  return (
    <LearningCenterContext.Provider value={value}>
      {children}
      {open ? (
        <LearningCenterDrawer
          selectedId={selectedId}
          onSelect={setSelectedId}
          onClose={closeLearningCenter}
        />
      ) : null}
    </LearningCenterContext.Provider>
  );
}

export function useLearningCenter() {
  const context = useContext(LearningCenterContext);
  if (!context)
    throw new Error(
      "useLearningCenter must be used inside LearningCenterProvider.",
    );
  return context;
}
