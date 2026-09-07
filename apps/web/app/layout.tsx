import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Suspense, type ReactNode } from "react";
import { parseRumSampleRate } from "@/lib/web-vitals";
import "@founderhq/design-tokens/css";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { WebVitalsReporter } from "@/components/web-vitals-reporter";
import { trevvBrand } from "@/lib/branding";
import { themePreferenceBootstrap } from "@/lib/display-preferences";
import "./globals.css";
import "./public-product.css";

const appName = trevvBrand.name;

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: { default: appName, template: `%s · ${appName}` },
  description:
    "Fictional-data technical preview of a focused founder workflow for attention, ownership, decisions, and coordination.",
  robots: { index: false, follow: false, noarchive: true, nocache: true },
  alternates: { canonical: "/" },
  applicationName: appName,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: appName, statusBarStyle: "default" },
  openGraph: {
    type: "website",
    title: appName,
    description:
      "Fictional-data technical preview of TREVV's founder workflow.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "TREVV attention-first portfolio overview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: appName,
    description:
      "Fictional-data technical preview of TREVV's founder workflow.",
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
        <Script
          dangerouslySetInnerHTML={{ __html: themePreferenceBootstrap }}
          id="theme-preference-bootstrap"
          strategy="beforeInteractive"
        />
        {children}
        <Suspense fallback={null}>
          <WebVitalsReporter
            enabled={process.env.NEXT_PUBLIC_RUM_ENABLED === "true"}
            sampleRate={parseRumSampleRate(
              process.env.NEXT_PUBLIC_RUM_SAMPLE_RATE,
            )}
          />
        </Suspense>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
