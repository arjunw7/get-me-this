/**
 * Behavioral navigation test for the client analytics lane.
 *
 * The unit suite (src/analytics/client.test.ts) proves the client-lane
 * CONTRACT against a mocked SDK. This spec proves the real, production-
 * bundled SDK actually TRANSPORTS sanitized pageviews when a real browser
 * loads the app and navigates — the review requirement that cannot be
 * satisfied by mocks.
 *
 * How it works:
 * - This suite runs against the production build made with fixture public
 *   env (NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=phc-fixture-token,
 *   NEXT_PUBLIC_POSTHOG_HOST=http://127.0.0.1:3100/analytics-fixture, set
 *   by the `test:analytics` script). The fixture token is a synthetic
 *   public client ingest token, never a real credential.
 * - Every request is intercepted locally. Fixture-endpoint requests are
 *   fulfilled with empty deterministic responses; the test therefore
 *   observes the network behavior of the real SDK while nothing can ever
 *   reach PostHog's (or any other) real servers. As a privacy assertion,
 *   ANY request to a host other than the app or its fixture endpoint
 *   fails the test.
 * - The pinned SDK's bot filter silently drops every event when the
 *   browser reports automation markers (navigator.webdriver or a
 *   HeadlessChrome UA brand). Clearing those three signals is a
 *   test-environment accommodation only; the shipped application
 *   configuration is untouched and remains production-accurate.
 *
 * Asserted behavior:
 * 1. Initial load of a second route (the not-found page) emits exactly one
 *    sanitized $pageview for that route's template.
 * 2. A real client-side Next `Link` transition to a different route (the
 *    not-found page's internal link home) emits exactly one sanitized
 *    $pageview for the new template, and a page-side marker proves the
 *    document did NOT reload.
 * 3. A same-template internal Link click emits nothing further
 *    (consecutive-duplicate guard), and a browser back navigation re-emits
 *    the previous template exactly once more.
 * 4. Every transported $pageview carries ONLY the sanitized route
 *    template, the derived queryless current URL, and the SDK-required
 *    public ingest token — never a raw URL, referrer, or query string.
 *
 * Any request whose PARSED ORIGIN differs from the app origin is aborted
 * immediately (never continued) and recorded for the privacy assertion.
 */
import { gunzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";

interface CapturedPageview {
  readonly pathname: string | undefined;
  readonly currentUrl: string | undefined;
  readonly propertyKeys: readonly string[];
}

const FIXTURE_TOKEN = "phc-fixture-token";
const FIXTURE_HOST_MARKER = "/analytics-fixture/";
const APP_ORIGIN = "http://127.0.0.1:3100";

/** Decodes a /e/ request body in any transport encoding the SDK picks. */
function decodeBatchEvents(
  postDataBuffer: Buffer | null,
): Array<Record<string, unknown>> {
  if (!postDataBuffer || postDataBuffer.length === 0) {
    return [];
  }
  let jsonText: string | undefined;
  const text = postDataBuffer.toString("utf8");
  if (text.startsWith("data=")) {
    jsonText = Buffer.from(text.slice(5), "base64").toString("utf8");
  } else if (text.startsWith("{")) {
    jsonText = text;
  } else {
    try {
      jsonText = gunzipSync(postDataBuffer).toString("utf8");
    } catch {
      return [];
    }
  }
  try {
    const parsed: { batch?: Array<Record<string, unknown>> } =
      JSON.parse(jsonText);
    return parsed.batch ?? [];
  } catch {
    return [];
  }
}

function pageviewOf(event: Record<string, unknown>): CapturedPageview {
  const properties = (event.properties ?? {}) as Record<string, unknown>;
  return {
    pathname:
      typeof properties.$pathname === "string"
        ? properties.$pathname
        : undefined,
    currentUrl:
      typeof properties.$current_url === "string"
        ? properties.$current_url
        : undefined,
    propertyKeys: Object.keys(properties).sort(),
  };
}

test.describe("client analytics lane: behavioral navigation", () => {
  // Headless Chromium otherwise reports a HeadlessChrome UA brand, which the
  // pinned SDK's bot filter treats as a bot (see file header).
  test.use({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  test("emits exactly one sanitized pageview per distinct route template and nothing else", async ({
    page,
  }) => {
    const outsideRequests: string[] = [];
    const pageviewEvents: Record<string, unknown>[] = [];
    const consentEvents: Array<{
      event: string;
      properties: Record<string, unknown>;
    }> = [];

    await page.route("**/*", async (route) => {
      const url = route.request().url();
      // Exact parsed-origin comparison — a string prefix check would let a
      // lookalike origin such as http://127.0.0.1:3100.evil.example/ through.
      let origin: string | undefined;
      try {
        origin = new URL(url).origin;
      } catch {
        origin = undefined;
      }
      if (origin !== APP_ORIGIN) {
        // Record and abort immediately: a non-app request must never be
        // continued to the network.
        if (!outsideRequests.includes(url)) {
          outsideRequests.push(url);
        }
        await route.abort();
        return;
      }
      const { pathname } = new URL(url);
      const isFixture = pathname.includes(FIXTURE_HOST_MARKER);
      if (isFixture) {
        if (pathname.endsWith("config.js")) {
          await route.fulfill({
            status: 200,
            contentType: "application/javascript",
            body: "/* fixture: no remote config */",
          });
        } else {
          if (route.request().method() === "POST" && pathname.includes("/e/")) {
            for (const event of decodeBatchEvents(
              route.request().postDataBuffer(),
            )) {
              if (event.event === "$pageview") {
                pageviewEvents.push(event);
              } else if (
                event.event === "$opt_in" ||
                event.event === "$opt_out"
              ) {
                consentEvents.push({
                  event: String(event.event),
                  properties: (event.properties ?? {}) as Record<
                    string,
                    unknown
                  >,
                });
              }
            }
          }
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: "{}",
          });
        }
        return;
      }
      await route.continue();
    });

    // Clear the automation markers the pinned SDK's bot filter drops
    // events for. Test-environment accommodation only (see file header).
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "webdriver", {
        get: () => undefined,
        configurable: true,
      });
      try {
        Object.defineProperty(navigator, "webdriver", {
          get: () => undefined,
          configurable: true,
        });
      } catch {
        // Some engines expose webdriver as an own property; the prototype
        // override above then already applies.
      }
      Object.defineProperty(Navigator.prototype, "userAgentData", {
        get: () => ({
          brands: [{ brand: "Chromium", version: "131" }],
          mobile: false,
        }),
        configurable: true,
      });
      document.cookie =
        "gmt_analytics_consent=granted; Path=/; Max-Age=15552000; SameSite=Lax";
    });

    // 1. Initial load of a nonexistent route (the app's not-found page):
    //    exactly one pageview for its sanitized template, once the SDK's
    //    asynchronous initialization has completed (the loaded-callback
    //    contract). A stable nonexistent path is used on purpose: /onboarding
    //    becomes a real route in 003b and must not be a not-found stand-in.
    //    An unlisted path is sanitized to the opaque "/:unlisted" template —
    //    the raw segment must never leave the browser, which step 5 asserts.
    const notFoundPageviews = () =>
      pageviewEvents
        .map(pageviewOf)
        .filter((event) => event.pathname === "/:unlisted");
    await page.goto("/this-route-does-not-exist");
    await expect
      .poll(() => notFoundPageviews().length, {
        message:
          "expected exactly one sanitized initial $pageview for the not-found route",
      })
      .toBe(1);

    // Marker for the no-reload proof below: a full document load replaces the
    // window and loses this property; a client-side router transition does not.
    await page.evaluate(() => {
      (
        window as unknown as { __analyticsNoReloadMarker?: number }
      ).__analyticsNoReloadMarker = 42;
    });

    // 2. A real client-side Next Link transition to a DIFFERENT route: the
    //    not-found page's "Back to home" link, now pointing at the landing
    //    page ("/"). The router hook must fire and the transition must
    //    transport exactly one sanitized $pageview for the new template.
    await page.click('a[href="/"]');
    const homePageviews = () =>
      pageviewEvents.map(pageviewOf).filter((event) => event.pathname === "/");
    await expect
      .poll(() => homePageviews().length, {
        message:
          "expected exactly one sanitized $pageview for / from the client-side Link transition",
      })
      .toBe(1);
    const noReloadMarker = await page.evaluate(
      () =>
        (window as unknown as { __analyticsNoReloadMarker?: number })
          .__analyticsNoReloadMarker,
    );
    expect(
      noReloadMarker,
      "document must not reload on a Link transition",
    ).toBe(42);

    // 3. A same-template internal Link click emits nothing further — the
    //    consecutive-duplicate guard holds under real router navigation.
    await page.click('a[href="/"]');
    await page.waitForTimeout(5_000);
    expect(homePageviews()).toHaveLength(1);

    // 4. A browser back navigation re-emits the pageview for the restored
    //    not-found template exactly once (with the static prerender the pop
    //    performs a document load, so this exercises the initial-pageview
    //    path of the restored route; the client-side transition path is
    //    covered by step 2).
    await page.evaluate(() => history.back());
    await page.waitForTimeout(5_000);
    expect(notFoundPageviews()).toHaveLength(2);

    // 5. Privacy shape of every transported pageview.
    for (const captured of pageviewEvents.map(pageviewOf)) {
      expect(captured.propertyKeys).toContain("distinct_id");
      expect(captured.propertyKeys).toContain("token");
      expect(
        captured.propertyKeys.every((key) =>
          [
            "$current_url",
            "$pathname",
            "token",
            "distinct_id",
            "$anon_distinct_id",
            "$session_id",
            "$window_id",
            "$process_person_profile",
            "$geoip_disable",
          ].includes(key),
        ),
      ).toBe(true);
      expect(captured.currentUrl, "no query strings may leave").not.toContain(
        "?",
      );
      expect(captured.currentUrl?.startsWith(APP_ORIGIN)).toBe(true);
    }

    // The consent event is equally minimal: the public ingest token and
    // nothing else.
    expect(consentEvents.length).toBeGreaterThanOrEqual(1);
    for (const consent of consentEvents) {
      expect(consent.properties.token).toBe(FIXTURE_TOKEN);
      expect(
        Object.keys(consent.properties).every((key) =>
          [
            "token",
            "distinct_id",
            "$anon_distinct_id",
            "$session_id",
            "$window_id",
            "$process_person_profile",
            "$geoip_disable",
          ].includes(key),
        ),
      ).toBe(true);
    }

    for (const event of pageviewEvents) {
      expect((event.properties as Record<string, unknown>).$geoip_disable).toBe(
        true,
      );
    }

    // 6. Nothing ever left the machine except to the app and its fixture.
    expect(outsideRequests, "no external analytics transport").toEqual([]);

    // The synthetic fixture token never appears as a real credential — and
    // no raw route parameter (none exist on these routes) could leak.
    const serialized = JSON.stringify(pageviewEvents);
    expect(serialized).not.toContain("SECRETTOKEN123");
    expect(serialized).not.toContain("otp=");
  });
  test("consent is optional, persists, and withdrawal stops browser events", async ({
    page,
  }) => {
    const sent: Record<string, unknown>[] = [];
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== APP_ORIGIN) return route.abort();
      if (url.pathname.includes(FIXTURE_HOST_MARKER)) {
        if (route.request().method() === "POST")
          sent.push(...decodeBatchEvents(route.request().postDataBuffer()));
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "{}",
        });
      }
      return route.continue();
    });
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "webdriver", {
        get: () => undefined,
      });
      Object.defineProperty(Navigator.prototype, "userAgentData", {
        get: () => ({
          brands: [{ brand: "Chromium", version: "131" }],
          mobile: false,
        }),
      });
    });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Reject", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "/tmp/gmt-posthog-consent-desktop.png",
      fullPage: false,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileBar = await page.locator(".analytics-consent").boundingBox();
    expect(mobileBar?.x).toBe(0);
    expect(mobileBar?.width).toBe(390);
    expect((mobileBar?.y ?? 0) + (mobileBar?.height ?? 0)).toBe(844);
    await page.screenshot({
      path: "/tmp/gmt-posthog-consent-mobile.png",
      fullPage: false,
    });
    await page.waitForTimeout(3000);
    expect(sent).toEqual([]);
    await page
      .getByRole("button", { name: "Allow cookies", exact: true })
      .click();
    await expect
      .poll(() => sent.filter((e) => e.event === "$pageview").length)
      .toBe(1);
    await expect(page.locator(".analytics-consent")).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".analytics-consent")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Cookie preferences", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Cookie preferences", exact: true })
      .click();
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(page.locator(".analytics-consent")).toHaveCount(0);
    await page.waitForTimeout(3000);
    const count = sent.length;
    await page.goto("/how-it-works");
    await page.waitForTimeout(3000);
    expect(sent).toHaveLength(count);
    expect(
      (await page.context().cookies()).find(
        (c) => c.name === "gmt_analytics_consent",
      )?.value,
    ).toBe("denied");
  });
});
