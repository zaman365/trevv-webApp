import {
  useSyncExternalStore,
  type ReactNode,
  type ComponentProps,
} from "react";
export function WorkspaceFrame({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
export function AppLink(props: ComponentProps<"a">) {
  return <a {...props} />;
}
export function useReportRouteReady() {}
export function useRouter() {
  return { push: (href: string) => window.location.assign(href) };
}

export function usePathname() {
  return window.location.pathname;
}

function subscribeSearch(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}
export function useSearchParams() {
  const search = useSyncExternalStore(
    subscribeSearch,
    () => window.location.search,
    () => "",
  );
  return new URLSearchParams(search);
}
