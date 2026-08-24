export const trevvBrand = {
  name: process.env.NEXT_PUBLIC_APP_NAME ?? "TREVV",
  organization: process.env.NEXT_PUBLIC_DEMO_ORGANIZATION ?? "TREVV Demo",
  domain: process.env.NEXT_PUBLIC_PRIMARY_DOMAIN ?? "trevv.de",
  promise:
    "Bring every responsibility together and see where your attention matters.",
} as const;
