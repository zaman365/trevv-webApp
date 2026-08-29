export type CapabilityStatus = "live" | "preview" | "demo-only" | "unavailable";

export interface ProductCapability {
  status: CapabilityStatus;
  title: string;
  description: string;
}

/**
 * Product truth for the currently hosted Web experience.
 *
 * Keep this registry aligned with docs/known-limitations.md. A capability may
 * be promoted to `live` only when its authoritative server operation,
 * authorization, durable storage, failure handling, and production-mode test
 * all exist. UI copy should consume this registry instead of inventing a
 * local claim about delivery, persistence, or security.
 */
export const productCapabilities = {
  authentication: {
    status: "unavailable",
    title: "Authentication is not active",
    description:
      "The sign-in and onboarding screens open a fictional sample workspace. They do not verify credentials or create an account.",
  },
  browserChanges: {
    status: "demo-only",
    title: "Changes stay in this browser",
    description:
      "Interactive changes are for exploring the fictional sample workspace. They are not durable, shared, or permission-enforced.",
  },
  teams: {
    status: "demo-only",
    title: "Teams are an interactive demo",
    description:
      "Team membership and capability changes stay in this browser and do not grant real access.",
  },
  messages: {
    status: "demo-only",
    title: "Messages are not delivered",
    description:
      "Conversation changes stay in this browser. No person, team, or external service receives them.",
  },
  waitingFollowUp: {
    status: "preview",
    title: "Follow-ups are drafts",
    description:
      "TREVV records a local follow-up preview only. It does not send email, Slack, or any other notification.",
  },
  email: {
    status: "demo-only",
    title: "Email is a fictional mailbox",
    description:
      "Messages and account labels are browser-local samples. No mailbox is connected and no email is sent.",
  },
  integrations: {
    status: "preview",
    title: "Provider connections are previews",
    description:
      "Smart-link and picker settings demonstrate intended behavior. No production OAuth token, sync, webhook, or provider write is active.",
  },
  import: {
    status: "preview",
    title: "Import is a dry-run preview",
    description:
      "The sample mapping and report create no records and upload no file.",
  },
  export: {
    status: "demo-only",
    title: "Exports contain sample browser data",
    description:
      "Downloads are generated locally from fictional and browser-local data. They are not complete, server-audited organization exports.",
  },
  security: {
    status: "unavailable",
    title: "Account security controls are not active",
    description:
      "Sessions, two-step verification, login alerts, and revocation are fictional examples and cannot change account security.",
  },
  invitations: {
    status: "demo-only",
    title: "Invitations are drafts",
    description:
      "Preparing an invitation only changes the fictional directory in this browser. No email is sent and no access is granted.",
  },
  publishedUpdates: {
    status: "demo-only",
    title: "Updates are local previews",
    description:
      "Saving the preview records a sample update in this browser. It does not notify stakeholders or persist to a shared workspace.",
  },
  automation: {
    status: "preview",
    title: "Automations are previews",
    description:
      "Rules can be explored locally, but no background worker or external action is enabled.",
  },
  uploads: {
    status: "unavailable",
    title: "Secure uploads are unavailable",
    description:
      "Private storage, authorization, malware scanning, and signed downloads are not connected.",
  },
  billing: {
    status: "unavailable",
    title: "Billing is unavailable",
    description:
      "TREVV does not accept payment or enforce a subscription in this technical preview.",
  },
} as const satisfies Record<string, ProductCapability>;

export type ProductCapabilityKey = keyof typeof productCapabilities;

export const productPreview = {
  stage: "Technical preview",
  data: "Fictional sample data",
  persistence: "Changes stay in this browser",
  conciseLabel:
    "Technical preview · fictional data · changes stay in this browser",
} as const;

export const capabilityStatusLabel: Record<CapabilityStatus, string> = {
  live: "Live",
  preview: "Preview",
  "demo-only": "Demo only",
  unavailable: "Unavailable",
};

export function getProductCapability(key: ProductCapabilityKey) {
  return productCapabilities[key];
}
