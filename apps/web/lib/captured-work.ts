"use client";

import type { WorkItemType } from "@founderhq/core";
import { useSyncExternalStore } from "react";

export type CapturedWorkType = WorkItemType | "note" | "link";

export interface CapturedWorkItem {
  id: string;
  type: CapturedWorkType;
  title: string;
  workspaceId: string;
  boardId: string;
  owner: string;
  priority: "urgent" | "high" | "normal" | "low";
  dueDate?: string;
  details?: string;
  evidenceUrl?: string;
  createdAt: string;
  sendToInbox: boolean;
}

const storageKey = "trevv:captured-work";
const captureEvent = "trevv:capture-created";
const emptySnapshot: CapturedWorkItem[] = [];
let cachedSnapshot: CapturedWorkItem[] | null = null;

export function useCapturedWork(): CapturedWorkItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => emptySnapshot);
}

export function storeCapturedWork(item: CapturedWorkItem): void {
  const current = readStorage();
  cachedSnapshot = [
    item,
    ...current.filter((entry) => entry.id !== item.id),
  ].slice(0, 50);
  try {
    localStorage.setItem(storageKey, JSON.stringify(cachedSnapshot));
  } catch {
    // The in-memory snapshot still keeps the current session functional.
  }
  window.dispatchEvent(new CustomEvent(captureEvent));
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
  window.addEventListener(captureEvent, handleChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(captureEvent, handleChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function getSnapshot(): CapturedWorkItem[] {
  if (cachedSnapshot === null) cachedSnapshot = readStorage();
  return cachedSnapshot;
}

function readStorage(): CapturedWorkItem[] {
  try {
    const value = JSON.parse(
      localStorage.getItem(storageKey) ?? "[]",
    ) as unknown;
    return Array.isArray(value) ? (value as CapturedWorkItem[]) : [];
  } catch {
    return cachedSnapshot ?? emptySnapshot;
  }
}
