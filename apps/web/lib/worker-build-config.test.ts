import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import workerNextConfig from "../worker-next.config";

describe("deployment target configuration", () => {
  it("preserves standalone Node packaging and all shared Worker settings", () => {
    expect(nextConfig.output).toBe("standalone");
    expect(workerNextConfig.output).toBeUndefined();
    expect(workerNextConfig.headers).toBe(nextConfig.headers);
    expect(workerNextConfig.transpilePackages).toEqual(
      nextConfig.transpilePackages,
    );
    for (const [key, value] of Object.entries(nextConfig)) {
      if (key !== "output")
        expect(Reflect.get(workerNextConfig, key)).toBe(value);
    }
  });
});
