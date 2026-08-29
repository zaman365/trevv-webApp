import type { MetadataRoute } from "next";
import { webCanonicalUrl } from "../lib/web-runtime-config";

/** Keep the technical preview out of search indexes until public-beta review. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
    host: webCanonicalUrl().origin,
  };
}
