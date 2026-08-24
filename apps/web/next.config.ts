import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@founderhq/api-client",
    "@founderhq/api-contract",
    "@founderhq/core",
    "@founderhq/design-tokens",
    "@founderhq/i18n",
  ],
};

export default nextConfig;
