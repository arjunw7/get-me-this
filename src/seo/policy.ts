import type { Metadata, MetadataRoute } from "next";
import {
  BRAND_DESCRIPTION,
  createBrandMetadata,
  publicSiteOrigin,
} from "@/src/brand/metadata";

export const LAUNCH_ORIGIN = "https://getmethis.fun";
// Only reviewed marketing pages belong here. Never derive this from app routes or user data.
export const PUBLIC_SEARCH_PATHS: readonly string[] = ["/", "/how-it-works"];
export type SeoEnvironment = {
  APP_ORIGIN?: string;
  RAILWAY_PUBLIC_DOMAIN?: string;
  NODE_ENV?: string;
  SEO_INDEXING_ENABLED?: string;
  RAILWAY_ENVIRONMENT_NAME?: string;
  RAILWAY_PR_NUMBER?: string;
};

function deploymentEnvironment(): SeoEnvironment {
  return {
    APP_ORIGIN: process.env.APP_ORIGIN,
    RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN,
    NODE_ENV: process.env.NODE_ENV,
    SEO_INDEXING_ENABLED: process.env.SEO_INDEXING_ENABLED,
    RAILWAY_ENVIRONMENT_NAME: process.env.RAILWAY_ENVIRONMENT_NAME,
    RAILWAY_PR_NUMBER: process.env.RAILWAY_PR_NUMBER,
  };
}

/** Opt-in only on the canonical deployment, with Railway preview vetoes. */
export function indexingEnabled(
  env: SeoEnvironment = deploymentEnvironment(),
): boolean {
  return (
    env.SEO_INDEXING_ENABLED === "true" &&
    publicSiteOrigin({ APP_ORIGIN: env.APP_ORIGIN })?.origin ===
      LAUNCH_ORIGIN &&
    !env.RAILWAY_PR_NUMBER &&
    (!env.RAILWAY_ENVIRONMENT_NAME ||
      env.RAILWAY_ENVIRONMENT_NAME === "production")
  );
}

export function mayIndexRequest(
  url: URL,
  method: string,
  env: SeoEnvironment = deploymentEnvironment(),
  requestHost: string = url.host,
): boolean {
  return (
    indexingEnabled(env) &&
    requestHost === new URL(LAUNCH_ORIGIN).host &&
    ["GET", "HEAD"].includes(method) &&
    PUBLIC_SEARCH_PATHS.includes(url.pathname)
  );
}

export function homepageMetadata(
  env: SeoEnvironment = deploymentEnvironment(),
): Metadata {
  const brand = createBrandMetadata(env);
  const enabled = indexingEnabled(env);
  return {
    title: "Get Me This | Your shareable gift wishlist",
    description:
      "Good gifts start with a wishlist. Save gift ideas from different stores in one wishlist. Share one link with friends. No group needed; private groups help you plan gifts together.",
    alternates: { canonical: `${LAUNCH_ORIGIN}/` },
    openGraph: { ...brand.openGraph, url: `${LAUNCH_ORIGIN}/` },
    robots: { index: enabled, follow: enabled },
  };
}

export function publicSitemap(
  env: SeoEnvironment = deploymentEnvironment(),
): MetadataRoute.Sitemap {
  return indexingEnabled(env)
    ? PUBLIC_SEARCH_PATHS.map((path) => ({
        url: new URL(path, LAUNCH_ORIGIN).href,
      }))
    : [];
}

export function crawlerPolicy(
  env: SeoEnvironment = deploymentEnvironment(),
): MetadataRoute.Robots {
  const enabled = indexingEnabled(env);
  return {
    rules: [
      // Fetching allows search crawlers to observe noindex on utility/share pages.
      // Authentication, not robots.txt, continues to protect application data.
      { userAgent: "*", allow: "/" },
      { userAgent: ["GPTBot", "ClaudeBot"], disallow: "/" },
      // Google-Extended governs Gemini grounding as well as training. Permit only
      // reviewed marketing pages; keep personal and capability URLs excluded.
      {
        userAgent: "Google-Extended",
        disallow: "/",
        ...(enabled
          ? { allow: PUBLIC_SEARCH_PATHS.map((path) => `${path}$`) }
          : {}),
      },
    ],
    ...(enabled ? { sitemap: `${LAUNCH_ORIGIN}/sitemap.xml` } : {}),
  };
}

export function websiteStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${LAUNCH_ORIGIN}/#website`,
        name: "Get Me This",
        url: `${LAUNCH_ORIGIN}/`,
        description: BRAND_DESCRIPTION,
      },
      {
        "@type": "WebApplication",
        "@id": `${LAUNCH_ORIGIN}/#app`,
        name: "Get Me This",
        url: `${LAUNCH_ORIGIN}/`,
        applicationCategory: "LifestyleApplication",
        operatingSystem: "Web browser",
        description: BRAND_DESCRIPTION,
      },
    ],
  };
}

const GUIDE_TITLE = "How Get Me This works: wishlists and private gift groups";
const GUIDE_DESCRIPTION =
  "Save gift ideas from different shops, share your wishlist with friends, and use private groups when you want to plan gifts together.";

export function howItWorksMetadata(
  env: SeoEnvironment = deploymentEnvironment(),
): Metadata {
  const brand = createBrandMetadata(env);
  const enabled = indexingEnabled(env);
  const url = `${LAUNCH_ORIGIN}/how-it-works`;
  return {
    ...brand,
    title: GUIDE_TITLE,
    description: GUIDE_DESCRIPTION,
    alternates: { canonical: url },
    openGraph: {
      ...brand.openGraph,
      title: GUIDE_TITLE,
      description: GUIDE_DESCRIPTION,
      url,
    },
    twitter: {
      ...brand.twitter,
      title: GUIDE_TITLE,
      description: GUIDE_DESCRIPTION,
    },
    robots: { index: enabled, follow: enabled },
  };
}

export function howItWorksStructuredData() {
  const url = `${LAUNCH_ORIGIN}/how-it-works`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: GUIDE_TITLE,
        description: GUIDE_DESCRIPTION,
        isPartOf: { "@id": `${LAUNCH_ORIGIN}/#website` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: `${LAUNCH_ORIGIN}/`,
          },
          { "@type": "ListItem", position: 2, name: "How it works", item: url },
        ],
      },
    ],
  };
}
