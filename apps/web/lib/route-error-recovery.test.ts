import { describe, expect, it, vi } from "vitest";
import { routeErrorRecovery } from "./route-error-recovery";

describe("route error recovery across runtimes", () => {
  it("uses Next's server retry when available", () => {
    const retry = vi.fn();
    const reset = vi.fn();
    routeErrorRecovery({ retry, reset })();
    expect(retry).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
  });

  it("uses the Worker reset callback instead of rendering an inert action", () => {
    const reset = vi.fn();
    routeErrorRecovery({ reset })();
    expect(reset).toHaveBeenCalledOnce();
  });

  it("has a working document recovery if a runtime provides neither callback", () => {
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    try {
      routeErrorRecovery({})();
      expect(reload).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reloads a failed server payload instead of resetting the same rejected RSC tree", () => {
    const reset = vi.fn();
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    try {
      routeErrorRecovery({
        reset,
        error: Object.assign(new Error("Server failed"), {
          digest: "opaque-reference",
        }),
      })();
      expect(reload).toHaveBeenCalledOnce();
      expect(reset).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
