import { useState } from "react";
import { createRoot } from "react-dom/client";
import { demoPortfolios } from "@founderhq/core";
import { LearningCenterProvider } from "../components/learning-center-context";
import {
  CreateWorkspaceDialog,
  PortfolioCreateDialog,
  UniversalCreateDialog,
} from "../components/lazy-create-dialogs";

function CreationFixture() {
  const [open, setOpen] = useState<
    "capture" | "workspace" | "portfolio" | null
  >(null);
  const [attempts, setAttempts] = useState(0);
  const [saved, setSaved] = useState("");
  return (
    <LearningCenterProvider>
      <button onClick={() => setOpen("capture")}>Open capture</button>
      <button onClick={() => setOpen("workspace")}>
        Open workspace creation
      </button>
      <button onClick={() => setOpen("portfolio")}>
        Open portfolio creation
      </button>
      <output id="saved">{saved}</output>
      {open === "capture" && (
        <UniversalCreateDialog
          onClose={() => setOpen(null)}
          onCreated={(item) => {
            setSaved(item.title);
            setOpen(null);
          }}
        />
      )}
      {open === "workspace" && (
        <CreateWorkspaceDialog
          mode="live"
          portfolios={demoPortfolios}
          initialPortfolioId={demoPortfolios[0]!.id}
          onClose={() => setOpen(null)}
          onCreated={(values) => {
            setAttempts((value) => value + 1);
            if (!attempts) return false;
            setSaved(JSON.stringify(values));
            setOpen(null);
            return true;
          }}
        />
      )}
      {open === "portfolio" && (
        <PortfolioCreateDialog
          mode="demo"
          existingSlugs={[]}
          onClose={() => setOpen(null)}
          onCreated={(portfolio) => {
            setSaved(portfolio.id);
            setOpen(null);
          }}
        />
      )}
    </LearningCenterProvider>
  );
}
createRoot(document.getElementById("root")!).render(<CreationFixture />);
