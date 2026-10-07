import type { MetadataRoute } from "next";
import { SITE_URL } from "./siteUrl";

// /sitemap.xml: the public pages, at their one canonical https address
export default function sitemap(): MetadataRoute.Sitemap {
    return [
        { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
        { url: `${SITE_URL}/login`, changeFrequency: "yearly", priority: 0.5 },
        { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
        { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    ];
}
