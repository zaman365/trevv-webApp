import type { HubType } from "@founderhq/core";

/**
 * What a customer calls the thing they are responsible for.
 *
 * The spec is right that not everything is a project — an operating company
 * is not a project, and calling it one is wrong. But "Hub" is jargon nobody
 * arrives knowing, and asking a new user to learn a word before they learn
 * the product is a real cost.
 *
 * So the word is data, not a constant. The model stays `hub`; the label comes
 * from what the customer said they were managing during onboarding (§29).
 * A venture studio sees Businesses, an agency sees Clients, and everyone else
 * sees Projects — the most widely understood default.
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
    one: "Project",
    many: "Projects",
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

/** Projects is the default: it is the word the most people already know. */
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
 * A project can still describe the kind of responsibility it contains without
 * reintroducing the old "Hub" product jargon in compact labels.
 */
export function labelForProjectType(type: HubType) {
  const typeLabel = labelForType(type);
  return typeLabel === "Project" ? typeLabel : `${typeLabel} project`;
}
