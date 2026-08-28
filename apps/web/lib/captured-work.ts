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
  const handleChange = () => {
    cachedSnapshot = readStorage();
    notify();
  };
  window.addEventListener(captureEvent, handleChange);
  window.addEventListener("storage", handleChange);
  return () => {
    window.removeEventListener(captureEvent, handleChange);
    window.removeEventListener("storage", handleChange);
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
