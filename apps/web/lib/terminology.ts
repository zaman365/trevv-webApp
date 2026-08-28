import type { HubType } from "@founderhq/core";

/**
 * What a customer calls the thing they are responsible for.
 *
 * The spec is right that not everything is a project — an operating company
 * is not a project, and calling it one is wrong. But "Hub" is jargon nobody
 * arrives knowing, and asking a new user to learn a word before they learn
 * the product is a real cost.
 *
 * The model stays `hub` for data compatibility, while the product-level label
 * is Workspace. Per-item type labels still explain whether a Workspace is a
 * business, brand, client, project, department, or initiative.
 */
export type VocabularyKey =
  | "projects"
  | "businesses"
  | "clients"
  | "products"
  | "departments"
  | "initiatives";

export interface Vocabulary {
  key: VocabularyKey;
  /** The responsibility container, formerly always "Hub". */
  one: string;
  many: string;
  /** The collection of them. */
  groupOne: string;
  groupMany: string;
  /** Shown in onboarding: "I manage …" */
  prompt: string;
}

export const VOCABULARIES: Record<VocabularyKey, Vocabulary> = {
  projects: {
    key: "projects",
    one: "Workspace",
    many: "Workspaces",
    groupOne: "Portfolio",
    groupMany: "Portfolios",
    prompt: "Projects and initiatives",
  },
  businesses: {
    key: "businesses",
    one: "Business",
    many: "Businesses",
    groupOne: "Portfolio",
    groupMany: "Portfolios",
    prompt: "Several businesses or brands",
  },
  clients: {
    key: "clients",
    one: "Client",
    many: "Clients",
    groupOne: "Book",
    groupMany: "Books",
    prompt: "Client accounts",
  },
  products: {
    key: "products",
    one: "Product",
    many: "Products",
    groupOne: "Portfolio",
    groupMany: "Portfolios",
    prompt: "Products or product lines",
  },
  departments: {
    key: "departments",
    one: "Department",
    many: "Departments",
    groupOne: "Organization",
    groupMany: "Organizations",
    prompt: "Departments or teams",
  },
  initiatives: {
    key: "initiatives",
    one: "Initiative",
    many: "Initiatives",
    groupOne: "Programme",
    groupMany: "Programmes",
    prompt: "Strategic initiatives",
  },
};

/** The legacy key remains stable while the customer-facing default is Workspace. */
export const DEFAULT_VOCABULARY: VocabularyKey = "projects";

export function vocabularyFor(key: VocabularyKey = DEFAULT_VOCABULARY) {
  return VOCABULARIES[key] ?? VOCABULARIES[DEFAULT_VOCABULARY];
}

/**
 * Per-item type labels. Even under one vocabulary, a card can say what it
 * actually is — "Client" on a client, "Brand" on a brand — which is more
 * informative than repeating the collection noun on every tile.
 */
const TYPE_LABELS: Record<string, string> = {
  business: "Business",
  brand: "Brand",
  client: "Client",
  product: "Product",
  department: "Department",
  venture: "Venture",
  initiative: "Initiative",
  investment: "Investment",
  campaign: "Campaign",
  program: "Programme",
  project: "Project",
  shared_function: "Shared function",
  client_program: "Client",
  journey: "Journey",
  other: "Other",
};

export function labelForType(type: HubType) {
  return TYPE_LABELS[type] ?? TYPE_LABELS.other!;
}

/**
 * A Workspace can describe the kind of responsibility it contains without
 * reintroducing the old "Hub" product jargon in compact labels.
 */
export function labelForProjectType(type: HubType) {
  const typeLabel = labelForType(type);
  return typeLabel === "Project"
    ? "Project workspace"
    : `${typeLabel} workspace`;
}
