import { expect, test } from "@playwright/test";

test("anonymous HTML exposes canonical, identity and readable product facts", async ({
  request,
}) => {
  const response = await request.get("/?loggedOut=1", {
    headers: { "User-Agent": "OAI-SearchBot" },
  });
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('rel="canonical" href="https://getmethis.fun/"');
  expect(html).toContain('property="og:url" content="https://getmethis.fun/"');
  expect(html).toContain('type="application/ld+json"');
  expect(html).toContain('"@type":"WebApplication"');
  expect(html).toContain("Good gifts start with a wishlist.");
  // No local/preview hostname is allowed into the canonical identity.
  expect(html).not.toMatch(
    /rel="canonical" href="http:\/\/(localhost|127\.0\.0\.1)/,
  );
});

test("preview and utility responses stay out of search", async ({
  request,
}) => {
  for (const path of [
    "/",
    "/auth",
    "/invite/unavailable",
    "/design-foundation",
    "/s/invalid",
    "/auth/confirm?bad=query",
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.headers()["x-robots-tag"], path).toBe("noindex, nofollow");
  }
  const auth = await request.get("/auth");
  expect(await auth.text()).toContain(
    'name="robots" content="noindex, nofollow"',
  );
});

test("crawler files are served with the correct types and no personal URLs", async ({
  request,
}) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(robots.headers()["content-type"]).toContain("text/plain");
  const policy = await robots.text();
  expect(policy).toContain("User-Agent: *");
  expect(policy).toContain("User-Agent: Google-Extended");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toContain("xml");
  expect(await sitemap.text()).toContain("<urlset");
  // This job is explicitly a preview, so it advertises no indexable URLs.
  expect(await sitemap.text()).not.toContain("<loc>");
  expect(policy).not.toContain("Sitemap:");
});
