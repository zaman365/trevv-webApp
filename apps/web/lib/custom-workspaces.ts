"use client";

import type { Board, Workspace, WorkspaceType } from "@founderhq/core";
import { useSyncExternalStore } from "react";

export interface CustomWorkspaceRecord {
  workspace: Workspace;
  board: Board;
  createdAt: string;
}

export interface CustomWorkspaceInput {
  name: string;
  portfolioId: string;
  type: WorkspaceType;
  lead: string;
  priority: string;
  milestone: string;
  milestoneDate: string;
}

const storageKey = "trevv:custom-workspaces";
const changeEvent = "trevv:custom-workspaces-changed";
const emptySnapshot: CustomWorkspaceRecord[] = [];
const accents = ["#5b56db", "#0d8b73", "#d46a50", "#3374c7", "#a36b16"];
let cachedSnapshot: CustomWorkspaceRecord[] | null = null;

export function useCustomWorkspaces(): CustomWorkspaceRecord[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => emptySnapshot);
}

export function createCustomWorkspace(
  input: CustomWorkspaceInput,
): CustomWorkspaceRecord {
  const timestamp = Date.now();
  const slugBase =
    input.name
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "project";
  const existing = new Set(
    readStorage().map((record) => record.workspace.slug),
  );
  let slug = slugBase;
  let suffix = 2;
  while (existing.has(slug)) slug = `${slugBase}-${suffix++}`;
  const id = `custom-workspace-${timestamp}`;
  const boardId = `custom-board-${timestamp}`;
  const lead = input.lead.trim() || "Mohammed Zaman";
  const initials = lead
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const record: CustomWorkspaceRecord = {
    createdAt: new Date(timestamp).toISOString(),
    workspace: {
      id,
      portfolioId: input.portfolioId,
      slug,
      name: input.name.trim(),
      icon: input.name.trim().slice(0, 1).toUpperCase(),
      accent: accents[readStorage().length % accents.length]!,
      type: input.type,
      stage: "idea",
      health: "on_track",
      healthNote:
        "New Workspace — define the first commitment and publish an update.",
      priority: input.priority.trim() || "Define the first meaningful outcome",
      lead: { name: lead, initials, color: "#5b56db" },
      nextMilestone: {
        title: input.milestone.trim() || "First operating review",
        date: input.milestoneDate,
      },
      latestUpdate: {
        text: "Workspace created in TREVV. Add the first work item to begin tracking movement.",
        date: new Date(timestamp).toISOString().slice(0, 10),
      },
      metrics: [],
      progressMode: "task_completion",
    },
    board: {
      id: boardId,
      workspaceId: id,
      name: `${input.name.trim()} Board`,
      category: "Work",
      description: "The operating board created with this Workspace.",
    },
  };
  const current = readStorage();
  cachedSnapshot = [record, ...current].slice(0, 20);
  persist(cachedSnapshot);
  window.dispatchEvent(new CustomEvent(changeEvent));
  return record;
}

function subscribe(notify: () => void): () => void {
  // Local writes already update the shared snapshot. Do not parse it once per
  // subscriber or overwrite a successful in-memory write when storage is blocked.
  const handleChange = () => notify();
  const handleStorage = (event: StorageEvent) => {
    if (event.storageArea !== window.localStorage) return;
    if (event.key !== null && event.key !== storageKey) return;
    cachedSnapshot = readStorage();
    notify();
  };
  window.addEventListener(changeEvent, handleChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(changeEvent, handleChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function getSnapshot(): CustomWorkspaceRecord[] {
  if (cachedSnapshot === null) cachedSnapshot = readStorage();
  return cachedSnapshot;
}

function readStorage(): CustomWorkspaceRecord[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(storageKey) ?? "[]",
    ) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCustomWorkspaceRecord);
  } catch {
    return cachedSnapshot ?? emptySnapshot;
  }
}

function persist(records: CustomWorkspaceRecord[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(records));
  } catch {
    // The in-memory snapshot keeps creation functional for this session.
  }
}

function isCustomWorkspaceRecord(
  value: unknown,
): value is CustomWorkspaceRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CustomWorkspaceRecord>;
  return Boolean(
    record.workspace?.id &&
    record.workspace.slug &&
    record.workspace.name &&
    record.board?.id &&
    record.board.workspaceId === record.workspace.id,
  );
}
