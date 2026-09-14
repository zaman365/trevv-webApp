"use client";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { PageSections, useEmbeddedSection } from "./page-sections";
import {
  sectionCatalog,
  workspaceSectionGroups,
  type OrganizedWorkspacePage,
} from "@/lib/page-sections";
import { workspaceHref, type WorkspaceView } from "@/lib/workspace-routes";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords } from "@/lib/live-app-data";

export const WorkspaceSectionContent = dynamic(
  () =>
    import("./workspace-section-content").then(
      (module) => module.WorkspaceSectionContent,
    ),
  { loading: () => <p role="status">Loading section…</p> },
);
export function sectionDestination(slug: string, id: string) {
  return id === "people"
    ? `${workspaceHref(slug)}/people`
    : workspaceHref(slug, id as WorkspaceView);
}
export function OptionalWorkspacePageSections(
  props: Parameters<typeof WorkspacePageSections>[0],
) {
  const session = useAppSession();
  return session.demo ? props.children : <WorkspacePageSections {...props} />;
}
export function WorkspacePageSections({
  page,
  workspaceSlug,
  children,
  primaryLabel,
  nested = false,
}: {
  page: string;
  workspaceSlug: string;
  children: ReactNode;
  primaryLabel?: string;
  nested?: boolean;
}) {
  const embedded = useEmbeddedSection();
  const data = useLiveAppRecords();
  const session = useAppSession();
  const workspace = data.workspaces.find(
    (entry) => entry.slug === workspaceSlug,
  );
  const ids = workspaceSectionGroups[page as OrganizedWorkspacePage];
  if ((embedded && !nested) || !ids || !workspace || data.accessLost)
    return children;
  const sections = ids.map((id) => ({
    id,
    label:
      (id === page ? primaryLabel : undefined) ??
      sectionCatalog[id]?.label ??
      (id === "calendar" ? "Schedule" : "Search"),
    ...(id !== page
      ? {
          title: sectionCatalog[id]?.title,
          description: sectionCatalog[id]?.description,
          href: sectionDestination(workspaceSlug, id),
        }
      : {}),
  }));
  return (
    <PageSections
      scope={`${session.organization.id}:${workspace.id}:${page}:${nested ? "nested" : "page"}`}
      queryParameter={nested ? "workSection" : "section"}
      label={`${page === "my-work" ? "My Work" : sections[0]!.label} sections`}
      sections={sections}
      renderSection={(section) => (
        <WorkspaceSectionContent
          section={section}
          workspaceSlug={workspaceSlug}
          workspaceId={workspace.id}
        />
      )}
    >
      {children}
    </PageSections>
  );
}
