import type { Metadata } from "next";

export const BRAND_TITLE = "Get Me This | Your shareable gift wishlist";
export const BRAND_DESCRIPTION =
  "Save gift ideas from different stores in one wishlist. Share one link with friends. No group needed.";
export const SHARE_IMAGE_PATH = "/assets/brand/share-banner-v2.png";
export const SHARE_IMAGE_ALT =
  "Get Me This — Good gifts start with a wishlist. Your shareable gift wishlist.";

type SiteEnvironment = {
  APP_ORIGIN?: string;
  RAILWAY_PUBLIC_DOMAIN?: string;
  NODE_ENV?: string;
};

/** Only deployment configuration can choose the public preview origin. */
export function publicSiteOrigin(env: SiteEnvironment): URL | undefined {
  const configured = env.APP_ORIGIN?.trim();
  const railwayDomain = env.RAILWAY_PUBLIC_DOMAIN?.trim();
  const candidate =
    configured ||
    (railwayDomain ? `https://${railwayDomain}` : undefined) ||
    (env.NODE_ENV === "development" ? "http://localhost:3000" : undefined);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
}

export function createBrandMetadata(
  env: SiteEnvironment = process.env,
): Metadata {
  const origin = publicSiteOrigin(env);
  const images = origin
    ? [
        {
          url: new URL(SHARE_IMAGE_PATH, origin).href,
          width: 1200,
          height: 630,
          type: "image/png",
          alt: SHARE_IMAGE_ALT,
        },
      ]
    : [];

  return {
    metadataBase: origin,
    title: BRAND_TITLE,
    description: BRAND_DESCRIPTION,
    applicationName: "Get Me This",
    openGraph: {
      type: "website",
      siteName: "Get Me This",
      title: "Good gifts start with a wishlist. | Get Me This",
      description: BRAND_DESCRIPTION,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: "Good gifts start with a wishlist. | Get Me This",
      description: BRAND_DESCRIPTION,
      images,
    },
  };
}
