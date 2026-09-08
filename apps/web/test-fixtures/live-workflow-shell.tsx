import type { ReactNode, ComponentProps } from "react";
export function WorkspaceFrame({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
export function AppLink(props: ComponentProps<"a">) {
  return <a {...props} />;
}
export function useReportRouteReady() {}
