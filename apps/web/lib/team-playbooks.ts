import type { TeamPreset } from "@founderhq/api-contract";

export const teamPlaybooks: Record<
  TeamPreset,
  {
    label: string;
    outcome: string;
    topics: string[];
    plans: { name: string; description: string; templateKey: string }[];
  }
> = {
  marketing: {
    label: "Marketing",
    outcome: "Plan campaigns, review creative work, and measure launches.",
    topics: ["Campaign planning", "Content and creative", "Launch results"],
    plans: [
      {
        name: "Campaign",
        templateKey: "marketing-campaign",
        description:
          "Audience and goal:\nChannels:\nKey message:\nSuccess metric and target:\nBudget:\nLaunch date:",
      },
      {
        name: "Content calendar",
        templateKey: "marketing-content",
        description:
          "Audience:\nContent pillars:\nPublishing channels:\nReview process:\nPublishing cadence:",
      },
    ],
  },
  technology: {
    label: "IT / Technology",
    outcome:
      "Plan delivery, track bugs, and keep technical decisions with the work.",
    topics: ["Sprint planning", "Engineering decisions", "Bugs and incidents"],
    plans: [
      {
        name: "Sprint",
        templateKey: "technology-sprint",
        description:
          "Sprint goal:\nDefinition of done:\nCapacity:\nRelease target:\nRisks and dependencies:",
      },
      {
        name: "Product backlog",
        templateKey: "technology-backlog",
        description:
          "Product goal:\nUser problems:\nPrioritization criteria:\nTechnical constraints:\nRelease milestones:",
      },
    ],
  },
  sales: {
    label: "Sales",
    outcome: "Keep account plans, proposals and customer follow-ups together.",
    topics: [
      "Account opportunities",
      "Proposals and pricing",
      "Customer handoffs",
    ],
    plans: [
      {
        name: "Account plan",
        templateKey: "sales-account",
        description:
          "Customer:\nOpportunity and value:\nDecision maker:\nNext customer action:\nTarget close date:",
      },
    ],
  },
  operations: {
    label: "Operations",
    outcome: "Coordinate recurring delivery, handoffs and service issues.",
    topics: ["Daily handoff", "Process improvements", "Service issues"],
    plans: [
      {
        name: "Operations cycle",
        templateKey: "operations-cycle",
        description:
          "Service or process:\nExpected outcome:\nCadence:\nHandoff owners:\nEscalation path:",
      },
    ],
  },
  leadership: {
    label: "Leadership",
    outcome: "Connect company goals, milestones, decisions and weekly reviews.",
    topics: ["Company priorities", "Decisions", "Weekly review"],
    plans: [
      {
        name: "Quarterly goals",
        templateKey: "leadership-goals",
        description:
          "Business objective:\nMeasurable outcomes:\nMilestones:\nAccountable owners:\nReview cadence:",
      },
    ],
  },
  custom: {
    label: "General team",
    outcome:
      "Give every project an owner, a goal and a shared place to discuss it.",
    topics: ["Planning", "Questions and decisions", "Progress updates"],
    plans: [
      {
        name: "Project",
        templateKey: "team-project",
        description: "Goal:\nScope:\nSuccess criteria:\nMilestones:\nRisks:",
      },
    ],
  },
};
