"use client";
import { lazy } from "react";
import { DashboardSectionContent } from "./live-dashboard-section-content";
import type { DashboardSection } from "@/lib/dashboard-sections";
const People = lazy(() =>
  import("./live-people-page").then((m) => ({ default: m.LivePeoplePage })),
);
const Review = lazy(() =>
  import("./live-work-reviews").then((m) => ({ default: m.LiveWeeklyReview })),
);
export function WorkspaceSectionContent({
  section,
  workspaceSlug,
  workspaceId,
}: {
  section: string;
  workspaceSlug: string;
  workspaceId: string;
}) {
  if (section === "people")
    return <People workspaceSlug={workspaceSlug} embedded />;
  if (section === "reviews") return <Review workspaceId={workspaceId} />;
  return (
    <DashboardSectionContent
      section={section as Exclude<DashboardSection, "summary">}
      workspaceSlug={workspaceSlug}
      workspaceId={workspaceId}
    />
  );
}
