import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@founderhq/design-tokens/css";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { trevvBrand } from "@/lib/branding";
import "./globals.css";
import "./workspace.css";
import "./design-system.css";

const appName = trevvBrand.name;

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: { default: appName, template: `%s · ${appName}` },
  description:
    "A calm operating system for every business, project, decision, and next move.",
  applicationName: appName,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: appName, statusBarStyle: "default" },
  openGraph: {
    type: "website",
    title: appName,
    description: "Everything you're running. One clear view.",
    images: [
      {
        url: "/og.png",
        width: 1728,
        height: 910,
        alt: "TREVV attention-first portfolio overview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: appName,
    description: "Everything you're running. One clear view.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#111522" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
