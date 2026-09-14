"use client";

import { lazy } from "react";
import { LiveSearch } from "./live-work-search";
const DemoSearch = lazy(() =>
  import("./demo-work-search").then((module) => ({
    default: module.DemoSearch,
  })),
);

export default function FloatingSearch(props: {
  workspaceId: string;
  workspaceSlug: string;
  demo: boolean;
  initialQuery: string;
  onClose(): void;
}) {
  return props.demo ? (
    <DemoSearch
      workspaceSlug={props.workspaceSlug}
      initialQuery={props.initialQuery}
      onClose={props.onClose}
    />
  ) : (
    <LiveSearch
      workspaceId={props.workspaceId}
      workspaceSlug={props.workspaceSlug}
      initialQuery={props.initialQuery}
      onClose={props.onClose}
    />
  );
}
