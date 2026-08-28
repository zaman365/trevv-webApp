"use client";

import { demoPortfolios, type Portfolio } from "@founderhq/core";
import { useSyncExternalStore } from "react";

export interface PortfolioVisual {
  mark: string;
  accent: string;
}

export interface CustomPortfolioRecord extends PortfolioVisual {
  portfolio: Portfolio;
  createdAt: string;
}

export interface CustomPortfolioInput extends PortfolioVisual {
  name: string;
  description: string;
}

const storageKey = "trevv:custom-portfolios";
const changeEvent = "trevv:custom-portfolios-changed";
const emptySnapshot: CustomPortfolioRecord[] = [];
let cachedSnapshot: CustomPortfolioRecord[] | null = null;

export const portfolioAccentOptions = [
  "#5b56db",
  "#167c69",
  "#c46b2b",
  "#3374c7",
  "#a34f7a",
] as const;

const builtInPortfolioVisuals: Record<string, PortfolioVisual> = {
  "portfolio-demo": { mark: "V", accent: "#5b56db" },
  "portfolio-personal": { mark: "MZ", accent: "#a36b16" },
  "portfolio-original": { mark: "O", accent: "#167c69" },
};

export function useCustomPortfolios(): CustomPortfolioRecord[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => emptySnapshot);
}

export function portfolioVisualFor(
  portfolio: Pick<Portfolio, "id" | "name">,
  customRecords: readonly CustomPortfolioRecord[] = [],
): PortfolioVisual {
  const custom = customRecords.find(
    (record) => record.portfolio.id === portfolio.id,
  );
  if (custom) return { mark: custom.mark, accent: custom.accent };
  return (
    builtInPortfolioVisuals[portfolio.id] ?? {
      mark: portfolio.name.trim().slice(0, 1).toUpperCase() || "P",
      accent: "#5b56db",
    }
  );
}

export function createCustomPortfolio(
  input: CustomPortfolioInput,
): CustomPortfolioRecord {
  const timestamp = Date.now();
  const slugBase =
    input.name
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "portfolio";
  const existingSlugs = new Set([
    ...demoPortfolios.map((portfolio) => portfolio.slug),
    ...readStorage().map((record) => record.portfolio.slug),
  ]);
  let slug = slugBase;
  let suffix = 2;
  while (existingSlugs.has(slug)) slug = `${slugBase}-${suffix++}`;

  const name = input.name.trim();
  const record: CustomPortfolioRecord = {
    createdAt: new Date(timestamp).toISOString(),
    mark:
      input.mark.trim().slice(0, 2).toUpperCase() ||
      name.slice(0, 1).toUpperCase(),
    accent: input.accent,
    portfolio: {
      id: `custom-portfolio-${timestamp}`,
      organizationId: "org-demo",
      name,
      slug,
      description:
        input.description.trim() ||
        "A focused collection of related projects and responsibilities.",
      isDefault: false,
    },
  };

  const current = readStorage();
  cachedSnapshot = [record, ...current].slice(0, 12);
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

function getSnapshot(): CustomPortfolioRecord[] {
  if (cachedSnapshot === null) cachedSnapshot = readStorage();
  return cachedSnapshot;
}

function readStorage(): CustomPortfolioRecord[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(storageKey) ?? "[]",
    ) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCustomPortfolioRecord);
  } catch {
    return cachedSnapshot ?? emptySnapshot;
  }
}

function persist(records: CustomPortfolioRecord[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(records));
  } catch {
    // The in-memory snapshot keeps creation functional for this session.
  }
}

function isCustomPortfolioRecord(
  value: unknown,
): value is CustomPortfolioRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CustomPortfolioRecord>;
  return Boolean(
    record.portfolio?.id &&
    record.portfolio.name &&
    record.portfolio.slug &&
    record.mark &&
    record.accent,
  );
}
