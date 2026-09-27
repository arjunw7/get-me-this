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
 * 1. Initial load emits exactly one sanitized $pageview for "/".
 * 2. A real internal Link click (a Next.js router transition for the same
 *    template) emits nothing further — the consecutive-duplicate guard
 *    holds under real navigation.
 * 3. A real second route load emits exactly one pageview with that
 *    route's sanitized template, and browser back navigation emits the
 *    original template once more.
 * 4. Every transported $pageview carries ONLY the sanitized route
 *    template, the derived queryless current URL, and the SDK-required
 *    public ingest token — never a raw URL, referrer, or query string.
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
      const isApp = url.startsWith(APP_ORIGIN);
      const isFixture = isApp && url.includes(FIXTURE_HOST_MARKER);
      if (!isApp && !outsideRequests.includes(url)) {
        outsideRequests.push(url);
      }
      if (isFixture) {
        if (url.endsWith("config.js")) {
          await route.fulfill({
            status: 200,
            contentType: "application/javascript",
            body: "/* fixture: no remote config */",
          });
        } else {
          if (route.request().method() === "POST" && url.includes("/e/")) {
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
      window.localStorage.setItem("gmt:analytics:consent", "granted");
    });

    await page.goto("/");

    // 1. Initial pageview: exactly one, for "/", once the SDK's asynchronous
    //    initialization has completed (the loaded-callback contract).
    const initialPageviews = () =>
      pageviewEvents.map(pageviewOf).filter((event) => event.pathname === "/");
    await expect
      .poll(() => initialPageviews().length, {
        message: "expected exactly one sanitized initial $pageview for /",
      })
      .toBe(1);

    // 2. A real internal Link click goes through Next.js's router transition
    //    hook (same route template), so the consecutive-duplicate guard must
    //    keep the count at exactly one — no duplicate pageview may transport.
    await page.click('a[href="/"]');
    await page.waitForTimeout(5_000);
    expect(initialPageviews()).toHaveLength(1);

    // 3. A second real route load (the not-found render for an unlisted
    //    route) emits exactly one pageview for its sanitized template.
    await page.goto("/onboarding");
    const onboardingPageviews = () =>
      pageviewEvents
        .map(pageviewOf)
        .filter((event) => event.pathname === "/onboarding");
    await expect
      .poll(() => onboardingPageviews().length, {
        message:
          "expected a sanitized $pageview for /onboarding after navigation",
      })
      .toBe(1);

    // 4. A real browser back navigation re-loads "/" and emits exactly one
    //    further pageview for that template.
    await page.goBack();
    await page.waitForTimeout(5_000);
    const homeAfterNavigation = pageviewEvents
      .map(pageviewOf)
      .filter((event) => event.pathname === "/");
    expect(homeAfterNavigation).toHaveLength(2);

    // 4. Privacy shape of every transported pageview.
    for (const captured of pageviewEvents.map(pageviewOf)) {
      expect(captured.propertyKeys, "pageview property allowlist").toEqual([
        "$current_url",
        "$pathname",
        "token",
      ]);
      expect(captured.currentUrl, "no query strings may leave").not.toContain(
        "?",
      );
      expect(captured.currentUrl?.startsWith(APP_ORIGIN)).toBe(true);
    }

    // The consent event is equally minimal: the public ingest token and
    // nothing else.
    expect(consentEvents.length).toBeGreaterThanOrEqual(1);
    for (const consent of consentEvents) {
      expect(consent.properties, `${consent.event} property allowlist`).toEqual(
        {
          token: FIXTURE_TOKEN,
        },
      );
    }

    // 5. Nothing ever left the machine except to the app and its fixture.
    expect(outsideRequests, "no external analytics transport").toEqual([]);

    // The synthetic fixture token never appears as a real credential — and
    // no raw route parameter (none exist on these routes) could leak.
    const serialized = JSON.stringify(pageviewEvents);
    expect(serialized).not.toContain("SECRETTOKEN123");
    expect(serialized).not.toContain("otp=");
  });
});
