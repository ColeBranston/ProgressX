import type { MetadataRoute } from "next";
import { SITE_URL } from "./siteUrl";

// /robots.txt: the public pages can be crawled; the API and signed-in app pages can't (they only
// redirect to the login page for a crawler anyway)
export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: ["/", "/login", "/terms", "/privacy"],
            disallow: ["/api/", "/homepage", "/profile", "/mydiet", "/mystats", "/research", "/search", "/settings", "/following", "/upload", "/consent", "/onboarding", "/solr-ingest/"],
        },
        sitemap: `${SITE_URL}/sitemap.xml`,
        host: SITE_URL,
    };
}
