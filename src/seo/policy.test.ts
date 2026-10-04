import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";
import robots from "../../app/robots";
import sitemap from "../../app/sitemap";
import { createBrandMetadata } from "@/src/brand/metadata";
import {
  crawlerPolicy,
  homepageMetadata,
  indexingEnabled,
  LAUNCH_ORIGIN,
  mayIndexRequest,
  publicSitemap,
  websiteStructuredData,
  type SeoEnvironment,
} from "./policy";

const production: SeoEnvironment = {
  APP_ORIGIN: LAUNCH_ORIGIN,
  SEO_INDEXING_ENABLED: "true",
  RAILWAY_ENVIRONMENT_NAME: "production",
};
afterEach(() => vi.unstubAllEnvs());

function configure(env: SeoEnvironment) {
  for (const key of [
    "APP_ORIGIN",
    "SEO_INDEXING_ENABLED",
    "RAILWAY_ENVIRONMENT_NAME",
    "RAILWAY_PR_NUMBER",
  ] as const)
    vi.stubEnv(key, env[key]);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", undefined);
}

describe("search indexing boundary", () => {
  it.each([
    {},
    { APP_ORIGIN: LAUNCH_ORIGIN },
    { SEO_INDEXING_ENABLED: "true", RAILWAY_PUBLIC_DOMAIN: "getmethis.fun" },
    { ...production, SEO_INDEXING_ENABLED: "false" },
    { ...production, APP_ORIGIN: "http://getmethis.fun" },
    { ...production, APP_ORIGIN: "https://getmethis.fun.evil.example" },
    { ...production, APP_ORIGIN: "https://user:secret@getmethis.fun" },
    { ...production, APP_ORIGIN: "https://getmethis.fun/private" },
    { ...production, APP_ORIGIN: "https://preview.up.railway.app" },
    { ...production, RAILWAY_ENVIRONMENT_NAME: "staging" },
    { ...production, RAILWAY_PR_NUMBER: "81" },
  ])(
    "fails closed outside an explicitly configured launch deployment: %j",
    (env) => {
      expect(indexingEnabled(env)).toBe(false);
      expect(homepageMetadata(env).robots).toEqual({
        index: false,
        follow: false,
      });
      expect(publicSitemap(env)).toEqual([]);
      expect(crawlerPolicy(env).sitemap).toBeUndefined();
    },
  );

  it("indexes only reviewed marketing pages on the canonical host", () => {
    expect(indexingEnabled(production)).toBe(true);
    for (const path of ["/", "/?loggedOut=1", "/?utm_source=chatgpt.com"])
      expect(
        mayIndexRequest(new URL(path, LAUNCH_ORIGIN), "GET", production),
      ).toBe(true);
    for (const path of [
      "/auth",
      "/auth/confirm?token_hash=private",
      "/invite/private",
      "/onboarding",
      "/home",
      "/groups/123",
      "/wishlist",
      "/s/private",
      "/s/private/images/123",
      "/design-foundation",
      "/unknown",
    ])
      expect(
        mayIndexRequest(new URL(path, LAUNCH_ORIGIN), "GET", production),
        path,
      ).toBe(false);
    expect(
      mayIndexRequest(new URL("https://www.getmethis.fun/"), "GET", production),
    ).toBe(false);
    expect(
      mayIndexRequest(
        new URL("https://preview.up.railway.app/"),
        "GET",
        production,
      ),
    ).toBe(false);
    expect(mayIndexRequest(new URL(LAUNCH_ORIGIN), "POST", production)).toBe(
      false,
    );
    expect(mayIndexRequest(new URL(LAUNCH_ORIGIN), "HEAD", production)).toBe(
      true,
    );
  });

  it("sets noindex on real proxy responses, including early auth redirects", async () => {
    configure(production);
    for (const path of [
      "/auth",
      "/auth/confirm?bad=query",
      "/invite/unavailable",
      "/s/invalid",
      "/groups",
      "/design-foundation",
    ]) {
      const response = await proxy(
        new NextRequest(new URL(path, LAUNCH_ORIGIN)),
      );
      expect(response.headers.get("X-Robots-Tag"), path).toBe(
        "noindex, nofollow",
      );
    }
    expect(
      (await proxy(new NextRequest(LAUNCH_ORIGIN))).headers.get("X-Robots-Tag"),
    ).toBeNull();
    expect(
      (
        await proxy(new NextRequest("https://preview.up.railway.app/"))
      ).headers.get("X-Robots-Tag"),
    ).toBe("noindex, nofollow");
    configure({ ...production, RAILWAY_PR_NUMBER: "81" });
    expect(
      (await proxy(new NextRequest(LAUNCH_ORIGIN))).headers.get("X-Robots-Tag"),
    ).toBe("noindex, nofollow");
  });

  it("keeps canonical www redirects noindex and preserves private link parameters", async () => {
    configure(production);
    for (const path of [
      "/",
      "/auth/confirm?token_hash=fixture-only&type=email",
      "/s/fixture-share?from=friend&from=whatsapp",
      "/favicon.ico",
    ]) {
      const response = await proxy(
        new NextRequest(`http://localhost:8080${path}`, {
          headers: { host: "www.getmethis.fun" },
        }),
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(`${LAUNCH_ORIGIN}${path}`);
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
      expect(response.headers.has("Set-Cookie")).toBe(false);
    }
  });

  it("recognizes the public host behind Next's internal listener URL", async () => {
    configure(production);
    const response = await proxy(
      new NextRequest("http://localhost:8080/", {
        headers: { host: "getmethis.fun" },
      }),
    );
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
    const preview = await proxy(
      new NextRequest("http://localhost:8080/", {
        headers: {
          host: "preview.up.railway.app",
          "x-forwarded-host": "getmethis.fun",
        },
      }),
    );
    expect(preview.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("keeps the canonical URL scoped to the homepage and retains the social image", () => {
    const metadata = homepageMetadata(production);
    expect(metadata.alternates?.canonical).toBe(`${LAUNCH_ORIGIN}/`);
    expect(metadata.openGraph).toMatchObject({
      url: `${LAUNCH_ORIGIN}/`,
      images: [{ url: `${LAUNCH_ORIGIN}/assets/brand/share-banner-v2.png` }],
    });
    expect(createBrandMetadata(production)).not.toHaveProperty("alternates");
    expect(createBrandMetadata(production).robots).toEqual({
      index: false,
      follow: false,
    });
  });

  it("preserves preview share images without making previews indexable", () => {
    const metadata = homepageMetadata({
      RAILWAY_PUBLIC_DOMAIN: "preview.up.railway.app",
    });
    expect(metadata.openGraph).toMatchObject({
      images: [
        {
          url: "https://preview.up.railway.app/assets/brand/share-banner-v2.png",
        },
      ],
    });
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("serves only approved public canonical URLs, without fabricated freshness", () => {
    configure(production);
    expect(sitemap()).toEqual([{ url: `${LAUNCH_ORIGIN}/` }]);
    expect(robots().sitemap).toBe(`${LAUNCH_ORIGIN}/sitemap.xml`);
    configure({});
    expect(sitemap()).toEqual([]);
  });

  it("lets search engines read noindex while separating training and Gemini controls", () => {
    expect(crawlerPolicy(production).rules).toEqual([
      { userAgent: "*", allow: "/" },
      { userAgent: ["GPTBot", "ClaudeBot"], disallow: "/" },
      { userAgent: "Google-Extended", disallow: "/", allow: ["/$"] },
    ]);
    expect(crawlerPolicy({}).rules).toContainEqual({
      userAgent: "Google-Extended",
      disallow: "/",
    });
  });

  it("describes the app, without pretending decorative gift cards are merchandise", () => {
    const data = websiteStructuredData();
    expect(data["@graph"].map((entity) => entity["@type"])).toEqual([
      "WebSite",
      "WebApplication",
    ]);
    expect(JSON.stringify(data)).not.toMatch(
      /aggregateRating|reviewCount|offers|Product|SearchAction/,
    );
    expect(
      data["@graph"].every((entity) => entity.url === `${LAUNCH_ORIGIN}/`),
    ).toBe(true);
  });
});
