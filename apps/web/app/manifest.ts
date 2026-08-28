import type { MetadataRoute } from "next";
import { trevvBrand } from "@/lib/branding";

export default function manifest(): MetadataRoute.Manifest {
  const name = trevvBrand.name;
  return {
    name,
    short_name: name,
    description:
      "Portfolio-first operating system for businesses, projects, teams, and everything else you are responsible for.",
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
