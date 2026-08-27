"use client";

import type { Board, Hub, HubType } from "@founderhq/core";
import { useSyncExternalStore } from "react";

export interface CustomHubRecord {
  hub: Hub;
  board: Board;
  createdAt: string;
}

export interface CustomHubInput {
  name: string;
  portfolioId: string;
  type: HubType;
  lead: string;
  priority: string;
  milestone: string;
  milestoneDate: string;
}

const storageKey = "trevv:custom-hubs";
const changeEvent = "trevv:custom-hubs-changed";
const emptySnapshot: CustomHubRecord[] = [];
const accents = ["#5b56db", "#0d8b73", "#d46a50", "#3374c7", "#a36b16"];
let cachedSnapshot: CustomHubRecord[] | null = null;

export function useCustomHubs(): CustomHubRecord[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => emptySnapshot);
}

export function createCustomHub(input: CustomHubInput): CustomHubRecord {
  const timestamp = Date.now();
  const slugBase =
    input.name
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "project";
  const existing = new Set(readStorage().map((record) => record.hub.slug));
  let slug = slugBase;
  let suffix = 2;
  while (existing.has(slug)) slug = `${slugBase}-${suffix++}`;
  const id = `custom-hub-${timestamp}`;
  const boardId = `custom-board-${timestamp}`;
  const lead = input.lead.trim() || "Mohammed Zaman";
  const initials = lead
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const record: CustomHubRecord = {
    createdAt: new Date(timestamp).toISOString(),
    hub: {
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
        "New project — define the first commitment and publish an update.",
      priority: input.priority.trim() || "Define the first meaningful outcome",
      lead: { name: lead, initials, color: "#5b56db" },
      nextMilestone: {
        title: input.milestone.trim() || "First operating review",
        date: input.milestoneDate,
      },
      latestUpdate: {
        text: "Project created in TREVV. Add the first work item to begin tracking movement.",
        date: new Date(timestamp).toISOString().slice(0, 10),
      },
      metrics: [],
      progressMode: "task_completion",
    },
    board: {
      id: boardId,
      hubId: id,
      name: `${input.name.trim()} Board`,
      category: "Work",
      description: "The operating board created with this project.",
    },
  };
  const current = readStorage();
  cachedSnapshot = [record, ...current].slice(0, 20);
  persist(cachedSnapshot);
  window.dispatchEvent(new CustomEvent(changeEvent));
  return record;
}

function subscribe(notify: () => void): () => void {
  const handleChange = () => {
    cachedSnapshot = readStorage();
    notify();
  };
  window.addEventListener(changeEvent, handleChange);
  window.addEventListener("storage", handleChange);
  return () => {
    window.removeEventListener(changeEvent, handleChange);
    window.removeEventListener("storage", handleChange);
  };
}

function getSnapshot(): CustomHubRecord[] {
  if (cachedSnapshot === null) cachedSnapshot = readStorage();
  return cachedSnapshot;
}

function readStorage(): CustomHubRecord[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(storageKey) ?? "[]",
    ) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCustomHubRecord);
  } catch {
    return cachedSnapshot ?? emptySnapshot;
  }
}

function persist(records: CustomHubRecord[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(records));
  } catch {
    // The in-memory snapshot keeps creation functional for this session.
  }
}

function isCustomHubRecord(value: unknown): value is CustomHubRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CustomHubRecord>;
  return Boolean(
    record.hub?.id &&
    record.hub.slug &&
    record.hub.name &&
    record.board?.id &&
    record.board.hubId === record.hub.id,
  );
}
