import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@founderhq/design-tokens/css";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import "./globals.css";
import "./workspace.css";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "FounderHQ";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: { default: appName, template: `%s · ${appName}` },
  description:
    "A clear operating system for every venture, decision, and next move.",
  applicationName: appName,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: appName, statusBarStyle: "default" },
  openGraph: {
    type: "website",
    title: appName,
    description: "Every venture. One clear next move.",
    images: [
      {
        url: "/og.png",
        width: 1729,
        height: 910,
        alt: "FounderHQ portfolio overview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: appName,
    description: "Every venture. One clear next move.",
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
