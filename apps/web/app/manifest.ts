import type { MetadataRoute } from "next";
import { trevvBrand } from "@/lib/branding";

export default function manifest(): MetadataRoute.Manifest {
  const name = trevvBrand.name;
  return {
    name,
    short_name: name,
    description:
      "Fictional-data technical preview of a focused founder workflow for attention, ownership, decisions, and coordination.",
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
