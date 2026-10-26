import type { MetadataRoute } from "next";
import { SITE_URL } from "./siteUrl";

// /robots.txt: the public pages can be crawled, including the public feed, research, search and people's
// public profiles (/profile/<username>); the API and the signed-in app pages can't (they only redirect
// to the login page for a crawler anyway). "/profile$" blocks your own profile page, not /profile/<name>.
export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: ["/", "/login", "/terms", "/privacy", "/explore", "/research", "/search", "/profile/"],
            disallow: ["/api/", "/homepage", "/profile$", "/mydiet", "/mystats", "/settings", "/following", "/upload", "/consent", "/onboarding", "/solr-ingest/"],
        },
        sitemap: `${SITE_URL}/sitemap.xml`,
        host: SITE_URL,
    };
}
