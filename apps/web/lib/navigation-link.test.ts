import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppSessionProvider, type AppSessionView } from "./app-session-context";

const state = vi.hoisted(() => ({
  props: {} as Record<string, unknown>,
  warm: vi.fn(),
}));
vi.mock("next/link", () => ({
  default: (props: Record<string, unknown>) => {
    state.props = props;
    return null;
  },
  useLinkStatus: () => ({ pending: false }),
}));
vi.mock("./route-code-preload", async (original) => ({
  ...(await original<typeof import("./route-code-preload")>()),
  preloadRouteCode: state.warm,
}));
import { NavigationLink } from "../components/navigation-link";

const session: AppSessionView = {
  demo: false,
  organization: { id: "org", name: "Org", role: "owner" },
  availableOrganizations: [],
  managedWorkspaceIds: [],
  user: { id: "user", name: "User", email: "user@example.test", role: "owner" },
};
function render(
  props: ComponentProps<typeof NavigationLink>,
  identity: AppSessionView | null = session,
) {
  const link = createElement(NavigationLink, props, "Destination");
  renderToStaticMarkup(
    identity ? AppSessionProvider({ session: identity, children: link }) : link,
  );
}
function fire(
  handler: "onFocus" | "onMouseEnter",
  event: { defaultPrevented: boolean; preventDefault?(): void },
) {
  const callback = state.props[handler] as (value: typeof event) => void;
  callback(event);
}
beforeEach(() => state.warm.mockClear());

describe("private route links", () => {
  it.each([
    "/app/portfolio",
    "/app/workspaces/one/messages#thread",
    { pathname: "/app/account/sessions" },
  ])("does not send automatic RSC prefetch for %j", (href) => {
    render({ href });
    expect(state.props.prefetch).toBe(false);
    expect(state.warm).not.toHaveBeenCalled();
  });
  it("warms static code on pointer and keyboard intent, preserving existing handlers", () => {
    const onMouseEnter = vi.fn();
    const onFocus = vi.fn();
    render({ href: "/app/portfolio", onMouseEnter, onFocus });
    const event = { defaultPrevented: false };
    fire("onMouseEnter", event);
    fire("onFocus", event);
    expect(onMouseEnter).toHaveBeenCalledWith(event);
    expect(onFocus).toHaveBeenCalledWith(event);
    expect(state.warm).toHaveBeenCalledWith("/app/portfolio", "live");
    expect(state.warm).toHaveBeenCalledTimes(2);
  });
  it("respects cancelled intent and avoids warming without an application session", () => {
    render({
      href: "/app/portfolio",
      onFocus: (event) => event.preventDefault(),
    });
    fire("onFocus", {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    });
    render({ href: "/app/portfolio" }, null);
    fire("onMouseEnter", { defaultPrevented: false });
    expect(state.warm).not.toHaveBeenCalled();
  });
  it("keeps public, external and hash links and their native props intact", () => {
    for (const href of ["/sign-in", "https://example.test/app", "#item"]) {
      const onClick = vi.fn();
      render({
        href,
        prefetch: true,
        target: "_blank",
        replace: true,
        scroll: false,
        onClick,
      });
      expect(state.props).toMatchObject({
        href,
        prefetch: true,
        target: "_blank",
        replace: true,
        scroll: false,
        onClick,
      });
      fire("onFocus", { defaultPrevented: false });
    }
    expect(state.warm).not.toHaveBeenCalled();
  });
  it("warms the demo route without importing the live experience", () => {
    render({ href: "/app/portfolio" }, { ...session, demo: true });
    fire("onFocus", { defaultPrevented: false });
    expect(state.warm).toHaveBeenCalledWith("/app/portfolio", "demo");
  });
});
