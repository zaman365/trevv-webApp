import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { session, snapshot } from "../test-fixtures/live-workflow-data";
import { AppShellProviders } from "../components/app-shell-providers";
import { LiveAppDataProvider, useLiveAppRecords } from "./live-app-data";
import { useAppSession } from "./app-session-context";
import { usePlanningSharing } from "./planning-sharing";

const route = vi.hoisted(() => ({ pathname: "/app/my-work" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
}));
vi.mock("../components/workspace-frame", () => ({
  WorkspaceShell: ({ children }: { children: ReactNode }) => children,
}));

function SharedPlanningConsumer() {
  const currentSession = useAppSession();
  const share = usePlanningSharing();
  const records = useLiveAppRecords();
  return createElement(
    "p",
    null,
    `${currentSession.user.id}:${typeof share}:${records.workspaces.length}`,
  );
}

describe("live shell provider composition", () => {
  it.each(["/app/my-work", "/app/account/privacy"])(
    "server-renders %s with session and planning sharing available",
    (pathname) => {
      route.pathname = pathname;
      const html = renderToStaticMarkup(
        <AppShellProviders session={session} liveData={snapshot}>
          <SharedPlanningConsumer />
        </AppShellProviders>,
      );
      expect(html).toContain(`${session.user.id}:function:`);
    },
  );

  it("renders the portfolio shell while its summary is still loading", () => {
    route.pathname = "/app/portfolio";
    expect(
      renderToStaticMarkup(
        <AppShellProviders session={session} liveData={snapshot}>
          <SharedPlanningConsumer />
        </AppShellProviders>,
      ),
    ).toContain("Loading your workspace");
  });

  it("keeps standalone live record surfaces independent of the app session", () => {
    const html = renderToStaticMarkup(
      <LiveAppDataProvider initialData={snapshot}>
        <p>Independent record surface</p>
      </LiveAppDataProvider>,
    );
    expect(html).toContain("Independent record surface");
  });
});
