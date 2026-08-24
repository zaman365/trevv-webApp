import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.NEXT_PUBLIC_APP_NAME ?? "FounderHQ";
  return {
    name,
    short_name: name,
    description:
      "Portfolio-first operating system for founders and their teams.",
    start_url: "/app/portfolio",
    display: "standalone",
    background_color: "#f5f6fa",
    theme_color: "#5b5bd6",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
