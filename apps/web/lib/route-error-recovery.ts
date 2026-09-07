export interface RouteErrorProps {
  error: Error & { digest?: string };
  retry?: (() => void) | undefined;
  reset?: (() => void) | undefined;
}

/** A decoded server error retains a rejected RSC payload after a client-only reset. */
export function routeErrorRecovery({
  retry,
  reset,
  error,
}: Partial<RouteErrorProps>) {
  return retry ?? (error?.digest ? reloadRoute : reset) ?? reloadRoute;
}

function reloadRoute() {
  window.location.reload();
}
