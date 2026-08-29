import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { webSecurityHeaders } from "./lib/security-headers";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const sensitiveAuthHeaders = [
  {
    key: "Cache-Control",
    value: "private, no-store, max-age=0, must-revalidate",
  },
  { key: "Pragma", value: "no-cache" },
  // Action tokens are stripped by proxy.ts before these pages render. Keeping
  // referrers same-origin preserves browser Origin/Fetch-Metadata CSRF signals
  // for their POSTs without disclosing auth-page URLs to another origin.
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingRoot: workspaceRoot,
  transpilePackages: [
    "@founderhq/api-client",
    "@founderhq/api-contract",
    "@founderhq/core",
    "@founderhq/design-tokens",
    "@founderhq/i18n",
  ],
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
  async headers() {
    return [
      { source: "/:path*", headers: webSecurityHeaders() },
      {
        source: "/app/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, max-age=0, must-revalidate",
          },
          { key: "Pragma", value: "no-cache" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      ...[
        "/sign-in",
        "/sign-up",
        "/onboarding",
        "/forgot-password",
        "/reset-password",
        "/verify-email",
        "/invite/accept",
        "/select-organization",
      ].map((source) => ({ source, headers: sensitiveAuthHeaders })),
    ];
  },
};

export default nextConfig;
