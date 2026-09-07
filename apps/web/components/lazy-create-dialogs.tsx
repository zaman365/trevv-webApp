"use client";

import { lazy, Suspense, type ComponentProps } from "react";

const loadUniversal = () =>
  import("./universal-create").then((module) => ({
    default: module.UniversalCreateDialog,
  }));
const loadWorkspace = () =>
  import("./create-workspace-dialog").then((module) => ({
    default: module.CreateWorkspaceDialog,
  }));
const loadPortfolio = () =>
  import("./portfolio-create-dialog").then((module) => ({
    default: module.PortfolioCreateDialog,
  }));
const loadLiveCapture = () =>
  import("./live-quick-capture").then((module) => ({
    default: module.LiveQuickCaptureDialog,
  }));
const Universal = lazy(loadUniversal);
const Workspace = lazy(loadWorkspace);
const Portfolio = lazy(loadPortfolio);
const LiveCapture = lazy(loadLiveCapture);
const loaders = {
  "demo-capture": loadUniversal,
  "live-capture": loadLiveCapture,
  workspace: loadWorkspace,
  portfolio: loadPortfolio,
};

export function warmCreateDialog(kind: keyof typeof loaders) {
  // Browser import caching shares this with the eventual dialog render; failed intent warming is harmless.
  void loaders[kind]().catch(() => undefined);
}

function LoadingDialog({
  onClose,
  title,
}: {
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="dialog-layer" role="presentation" onMouseDown={onClose}>
      <section
        className="capture-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy="true"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" autoFocus onClick={onClose}>
            Close
          </button>
        </header>
        <p role="status">Loading creation form…</p>
      </section>
    </div>
  );
}

export function UniversalCreateDialog(props: ComponentProps<typeof Universal>) {
  return (
    <Suspense
      fallback={
        <LoadingDialog onClose={props.onClose} title="Create in TREVV" />
      }
    >
      <Universal {...props} />
    </Suspense>
  );
}
export function CreateWorkspaceDialog(props: ComponentProps<typeof Workspace>) {
  return (
    <Suspense
      fallback={
        <LoadingDialog onClose={props.onClose} title="Create a workspace" />
      }
    >
      <Workspace {...props} />
    </Suspense>
  );
}
export function PortfolioCreateDialog(props: ComponentProps<typeof Portfolio>) {
  return (
    <Suspense
      fallback={
        <LoadingDialog onClose={props.onClose} title="Create a portfolio" />
      }
    >
      <Portfolio {...props} />
    </Suspense>
  );
}
export function LiveQuickCaptureDialog(
  props: ComponentProps<typeof LiveCapture>,
) {
  return (
    <Suspense
      fallback={<LoadingDialog onClose={props.onClose} title="Quick capture" />}
    >
      <LiveCapture {...props} />
    </Suspense>
  );
}
