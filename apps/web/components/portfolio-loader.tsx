"use client";

import dynamic from "next/dynamic";
import type { WebRuntimeMode } from "@/lib/web-runtime-config";
import { RouteLoadingState } from "./live-state";

const loading = () => <RouteLoadingState label="Loading Portfolio" />;
const LivePortfolioExperience = dynamic(
  () =>
    import("./live-portfolio-experience").then(
      (module) => module.LivePortfolioExperience,
    ),
  { loading },
);
const PortfolioExperience = dynamic(
  () =>
    import("./portfolio-experience").then(
      (module) => module.PortfolioExperience,
    ),
  { loading },
);

export function PortfolioLoader({
  runtimeMode,
}: {
  runtimeMode: WebRuntimeMode;
}) {
  return runtimeMode === "live" ? (
    <LivePortfolioExperience />
  ) : (
    <PortfolioExperience />
  );
}
