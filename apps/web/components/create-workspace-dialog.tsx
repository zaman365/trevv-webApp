"use client";

import { Grid2X2, Plus, X } from "lucide-react";
import {
  type Workspace,
  type WorkspaceType,
  type Portfolio,
} from "@founderhq/core";
import { useState, type FormEvent } from "react";
import { createCustomWorkspace } from "@/lib/custom-workspaces";

export function CreateWorkspaceDialog({
  portfolios,
  initialPortfolioId,
  onClose,
  onCreated,
}: {
  portfolios: readonly Portfolio[];
  initialPortfolioId: string;
  onClose: () => void;
  onCreated: (workspace: Workspace) => Promise<boolean> | boolean;
}) {
  const [name, setName] = useState("");
  const [portfolioId, setPortfolioId] = useState(initialPortfolioId);
  const [type, setType] = useState<WorkspaceType>("project");
  const [lead, setLead] = useState("Mohammed Zaman");
  const [priority, setPriority] = useState("");
  const [milestone, setMilestone] = useState("First operating review");
  const [milestoneDate, setMilestoneDate] = useState("2026-09-30");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !milestoneDate || pending) return;
    setMessage("");
    setPending(true);
    const record = createCustomWorkspace({
      name,
      portfolioId,
      type,
      lead,
      priority,
      milestone,
      milestoneDate,
    });
    let completed = false;
    try {
      completed = await onCreated(record.workspace);
    } catch {
      completed = false;
    }
    if (!completed) {
      setMessage(
        "The fictional workspace remains in this browser, but its preview could not be opened. Try again.",
      );
      setPending(false);
    }
  };

  const types: Array<[WorkspaceType, string]> = [
    ["business", "Business"],
    ["brand", "Brand"],
    ["client", "Client"],
    ["product", "Product"],
    ["venture", "Venture"],
    ["initiative", "Initiative"],
    ["project", "Project"],
    ["department", "Department"],
  ];

  return (
    <div className="dialog-layer" role="presentation" onMouseDown={onClose}>
      <form
        className="capture-dialog create-workspace-dialog"
        aria-labelledby="create-workspace-title"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
        role="dialog"
      >
        <header>
          <span className="attention-icon">
            <Grid2X2 size={17} />
          </span>
          <div>
            <h2 id="create-workspace-title">Create a workspace</h2>
            <p>
              A workspace keeps work, decisions, updates, evidence, and
              ownership together.
            </p>
          </div>
          <button
            aria-label="Close workspace creation"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </header>

        <div className="create-workspace-fields">
          <label>
            Workspace name
            <input
              autoFocus
              onChange={(event) => setName(event.target.value)}
              placeholder="Name the responsibility clearly"
              required
              value={name}
            />
          </label>
          <div>
            <label>
              Portfolio
              <select
                value={portfolioId}
                onChange={(event) => setPortfolioId(event.target.value)}
              >
                {portfolios.map((portfolio) => (
                  <option key={portfolio.id} value={portfolio.id}>
                    {portfolio.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select
                value={type}
                onChange={(event) =>
                  setType(event.target.value as WorkspaceType)
                }
              >
                {types.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Lead
            <input
              required
              value={lead}
              onChange={(event) => setLead(event.target.value)}
            />
          </label>
          <label>
            Current priority
            <input
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              placeholder="What outcome matters first?"
            />
          </label>
          <div>
            <label>
              First milestone
              <input
                required
                value={milestone}
                onChange={(event) => setMilestone(event.target.value)}
              />
            </label>
            <label>
              Target date
              <input
                required
                type="date"
                value={milestoneDate}
                onChange={(event) => setMilestoneDate(event.target.value)}
              />
            </label>
          </div>
        </div>

        <footer>
          <span role={message ? "alert" : undefined}>
            {message ||
              "Creates a fictional browser-only overview and empty board."}
          </span>
          <div>
            <button onClick={onClose} type="button">
              Cancel
            </button>
            <button
              className="primary-button"
              disabled={!name.trim() || !milestoneDate || pending}
              type="submit"
            >
              <Plus size={14} />
              {pending ? "Opening preview…" : "Create fictional workspace"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
