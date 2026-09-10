import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [
      { name: "trevv_alpha.session_token", value: "customer" },
      {
        name: "__Secure-trevv_superadmin.session_token",
        value: "administrator",
      },
    ],
  }),
  headers: async () =>
    new Headers({
      "cf-connecting-ip": "192.0.2.10",
      "x-forwarded-for": "198.51.100.99",
    }),
}));
vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    throw new Error(`redirect:${target}`);
  },
  notFound: () => {
    throw new Error("not-found");
  },
}));
vi.mock("./web-runtime-config", () => ({
  webRuntimeMode: () => "live",
  webApiOrigin: () => "https://api.trevv.test",
}));

import { requireSuperadminSession } from "./server-superadmin";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("preserves separate administrator cookies and trusted edge identity during session checks", async () => {
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "cf-connecting-ip");
  const upstream = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 401 }));
  vi.stubGlobal("fetch", upstream);
  await expect(requireSuperadminSession()).rejects.toThrow(
    "redirect:/superadmin/sign-in",
  );
  const outgoing = new Headers(
    (upstream.mock.calls[0]?.[1] as RequestInit).headers,
  );
  expect(outgoing.get("cookie")).toBe(
    "__Secure-trevv_superadmin.session_token=administrator",
  );
  expect(outgoing.get("cf-connecting-ip")).toBe("192.0.2.10");
  expect(outgoing.has("x-forwarded-for")).toBe(false);
});
