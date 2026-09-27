/**
 * @vitest-environment jsdom
 *
 * Client lane tests. posthog-js is mocked BEFORE initialization so the
 * real SDK (and therefore its transport layer) is never constructed. Every
 * browser transport the pinned SDK can use — fetch, XMLHttpRequest,
 * sendBeacon, and image beacons — is additionally stubbed to fail, proving
 * no network request can occur in tests.
 *
 * Covers: initialization with and without configuration; consent granted,
 * denied, and withdrawn; the anonymous→authenticated identity transition
 * (identify once with the Supabase UUID, never an email or name, no
 * alias()); reset on logout; replay privacy initialization options; and
 * that the client lane never duplicates a server-authoritative business
 * event.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthogMock = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  alias: vi.fn(),
  reset: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: posthogMock }));

const USER_UUID = "00000000-0000-4000-8000-000000000000";
const GROUP_UUID = "11111111-1111-4111-8111-111111111111";

const ENV_KEYS = [
  "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
  "NEXT_PUBLIC_POSTHOG_HOST",
] as const;
const CONSENT_KEY = "gmt:analytics:consent";

/** Every browser transport is stubbed to fail loudly if ever constructed. */
const transportViolations: string[] = [];

async function importClient() {
  return import("./client");
}

function stubAllTransports() {
  transportViolations.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      transportViolations.push("fetch");
      throw new Error("network is forbidden in tests");
    }),
  );
  vi.stubGlobal(
    "XMLHttpRequest",
    vi.fn(() => {
      transportViolations.push("XMLHttpRequest");
      throw new Error("network is forbidden in tests");
    }),
  );
  Object.defineProperty(window.navigator, "sendBeacon", {
    configurable: true,
    value: () => {
      transportViolations.push("sendBeacon");
      throw new Error("network is forbidden in tests");
    },
  });
  vi.stubGlobal(
    "Image",
    vi.fn(() => {
      transportViolations.push("Image");
      throw new Error("network is forbidden in tests");
    }),
  );
}

describe("client analytics lane", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {};
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    window.localStorage.clear();
    vi.resetModules();
    posthogMock.init.mockClear();
    posthogMock.capture.mockClear();
    posthogMock.identify.mockClear();
    posthogMock.alias.mockClear();
    posthogMock.reset.mockClear();
    posthogMock.opt_in_capturing.mockClear();
    posthogMock.opt_out_capturing.mockClear();
    stubAllTransports();
  });

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    vi.unstubAllGlobals();
    expect(transportViolations).toEqual([]);
  });

  describe("without configuration: completely inert", () => {
    it("does not initialize the SDK, so no transport is ever constructed", async () => {
      const client = await importClient();
      expect(client.isClientAnalyticsConfigured()).toBe(false);

      const initialized = await client.initClientAnalytics();
      expect(initialized).toBe(false);
      expect(posthogMock.init).not.toHaveBeenCalled();
      expect(transportViolations).toEqual([]);
    });

    it("captures, identifies, and resets nothing without configuration", async () => {
      const client = await importClient();
      await client.initClientAnalytics();
      client.setAnalyticsConsent("granted");
      client.captureSanitizedPageview("/onboarding");
      expect(client.identifyAuthenticatedUser(USER_UUID)).toBe(false);

      expect(posthogMock.init).not.toHaveBeenCalled();
      expect(posthogMock.capture).not.toHaveBeenCalled();
      expect(posthogMock.identify).not.toHaveBeenCalled();
    });
  });

  describe("with configuration, consent pending", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = "phc-test-token";
      process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://eu.i.posthog.test";
    });

    it("initializes exactly once with the privacy-hardened configuration", async () => {
      const client = await importClient();
      expect(await client.initClientAnalytics()).toBe(true);
      expect(await client.initClientAnalytics()).toBe(true);
      expect(posthogMock.init).toHaveBeenCalledTimes(1);

      const [token, config] = posthogMock.init.mock.calls[0] as unknown as [
        string,
        Record<string, unknown>,
      ];
      expect(token).toBe("phc-test-token");
      expect(config.api_host).toBe("https://eu.i.posthog.test");
      // Consent-gated: nothing captured or recorded until explicit consent.
      expect(config.opt_out_capturing_by_default).toBe(true);
      expect(config.person_profiles).toBe("identified_only");
      // Page-event ownership: manual, sanitized pageviews only.
      expect(config.capture_pageview).toBe(false);
      expect(config.capture_pageleave).toBe(false);
      // Replay ships disabled with privacy-hardened defaults for the future.
      expect(config.disable_session_recording).toBe(true);
      expect(config.session_recording).toMatchObject({
        maskAllInputs: true,
        blockClass: "ph-no-capture",
        maskTextClass: "ph-mask",
        recordBody: false,
        streamNetworkBody: false,
        sampleRate: 0,
      });
      expect(config.enable_recording_console_log).toBe(false);
      expect(config.capture_performance).toBe(false);
      // Autocapture behind strict allowlists and masks.
      expect(config.autocapture).toMatchObject({
        maskAllText: true,
        maskAllElementAttributes: true,
        disableCaptureUrlHashes: true,
        dom_event_allowlist: ["click", "change", "submit"],
        element_allowlist: ["a", "button", "form", "label", "select"],
        css_selector_ignorelist: [
          ".ph-no-capture",
          "[data-ph-no-capture]",
          ".ph-mask",
          "[data-ph-mask]",
        ],
      });
      expect(
        typeof (config.autocapture as Record<string, unknown>).getCurrentUrl,
      ).toBe("function");
      // Route templates are the only URLs that may leave the browser.
      expect(Array.isArray(config.before_send)).toBe(true);
      expect(transportViolations).toEqual([]);
    });

    it("captures nothing while consent is pending", async () => {
      const client = await importClient();
      await client.initClientAnalytics();
      expect(client.getAnalyticsConsent()).toBe("pending");

      client.captureSanitizedPageview("/onboarding");
      expect(posthogMock.capture).not.toHaveBeenCalled();
      expect(posthogMock.opt_in_capturing).not.toHaveBeenCalled();
    });
  });

  describe("with configuration, consent granted", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = "phc-test-token";
      process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://eu.i.posthog.test";
    });

    it("opts in on grant and captures exactly one sanitized pageview per route", async () => {
      const client = await importClient();
      await client.initClientAnalytics();

      client.setAnalyticsConsent("granted");
      expect(posthogMock.opt_in_capturing).toHaveBeenCalledTimes(1);
      expect(window.localStorage.getItem(CONSENT_KEY)).toBe("granted");

      // A synthetic invitation token must never leave the browser.
      client.captureSanitizedPageview(
        "/invite/SECRETTOKEN123?email=user@example.com",
      );
      // Same route again: exactly one pageview, no duplicates.
      client.captureSanitizedPageview("/invite/SECRETTOKEN123");
      expect(posthogMock.capture).toHaveBeenCalledTimes(1);
      expect(posthogMock.capture).toHaveBeenCalledWith("$pageview", {
        $current_url: `${window.location.origin}/invite/:token`,
        $pathname: "/invite/:token",
      });

      // A different route gets its own single pageview.
      client.captureSanitizedPageview(`/groups/${GROUP_UUID}`);
      expect(posthogMock.capture).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(posthogMock.capture.mock.calls)).not.toContain(
        "SECRETTOKEN123",
      );
      // The client lane emits only pageviews — never a business event, and
      // no duplicate $pageleave.
      for (const call of posthogMock.capture.mock.calls) {
        expect(call[0]).toBe("$pageview");
      }
    });

    it("re-applies granted consent when the SDK initializes afterwards", async () => {
      const client = await importClient();
      client.setAnalyticsConsent("granted");
      await client.initClientAnalytics();
      expect(posthogMock.opt_in_capturing).toHaveBeenCalledTimes(1);
    });
  });

  describe("consent denied and withdrawn", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = "phc-test-token";
      process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://eu.i.posthog.test";
    });

    it("opts out on denial and captures nothing", async () => {
      const client = await importClient();
      await client.initClientAnalytics();
      client.setAnalyticsConsent("denied");

      expect(posthogMock.opt_out_capturing).toHaveBeenCalledTimes(1);
      client.captureSanitizedPageview("/onboarding");
      expect(posthogMock.capture).not.toHaveBeenCalled();
    });

    it("stops capture when granted consent is withdrawn", async () => {
      const client = await importClient();
      await client.initClientAnalytics();
      client.setAnalyticsConsent("granted");
      client.captureSanitizedPageview("/onboarding");
      expect(posthogMock.capture).toHaveBeenCalledTimes(1);

      client.setAnalyticsConsent("denied");
      client.captureSanitizedPageview("/auth/callback");
      expect(posthogMock.capture).toHaveBeenCalledTimes(1);
      expect(posthogMock.opt_out_capturing).toHaveBeenCalledTimes(1);
    });
  });

  describe("identity: anonymous → authenticated → logout", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = "phc-test-token";
      process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://eu.i.posthog.test";
    });

    it("identifies exactly once with the Supabase user UUID and never aliases", async () => {
      const client = await importClient();
      await client.initClientAnalytics();

      expect(client.identifyAuthenticatedUser(USER_UUID)).toBe(true);
      expect(posthogMock.identify).toHaveBeenCalledTimes(1);
      expect(posthogMock.identify).toHaveBeenCalledWith(USER_UUID);

      // Exactly once: a second call is a no-op.
      expect(client.identifyAuthenticatedUser(USER_UUID)).toBe(false);
      expect(posthogMock.identify).toHaveBeenCalledTimes(1);
      // No alias() call: the pinned SDK links anonymous history in identify.
      expect(posthogMock.alias).not.toHaveBeenCalled();
    });

    it("refuses non-UUID identifiers such as emails and display names", async () => {
      const client = await importClient();
      await client.initClientAnalytics();

      expect(client.identifyAuthenticatedUser("user@example.com")).toBe(false);
      expect(client.identifyAuthenticatedUser("Arjun Wadhwa")).toBe(false);
      expect(posthogMock.identify).not.toHaveBeenCalled();
    });

    it("resets on logout so identities cannot leak between shared-browser users, and consent is re-applied", async () => {
      const client = await importClient();
      await client.initClientAnalytics();
      client.setAnalyticsConsent("granted");
      client.identifyAuthenticatedUser(USER_UUID);
      client.captureSanitizedPageview("/onboarding");

      client.resetAnalyticsOnLogout();
      expect(posthogMock.reset).toHaveBeenCalledTimes(1);
      // SDK reset clears consent state; granted consent is re-applied.
      expect(posthogMock.opt_in_capturing).toHaveBeenCalledTimes(2);

      // The next user of the shared browser can be identified again, and
      // the stale pageview dedupe does not suppress the next session's
      // first pageview.
      const SECOND_USER = "22222222-2222-4222-8222-222222222222";
      expect(client.identifyAuthenticatedUser(SECOND_USER)).toBe(true);
      client.captureSanitizedPageview("/onboarding");
      expect(posthogMock.capture).toHaveBeenCalledTimes(2);
    });
  });

  describe("business events stay server-authoritative", () => {
    it("exposes no capture API for the ten catalog events", async () => {
      const client = await importClient();
      const surface = client as unknown as Record<string, unknown>;
      const catalogEvents = [
        "auth_completed",
        "onboarding_completed",
        "group_created",
        "invite_sent",
        "invite_accepted",
        "wishlist_item_added",
        "product_extraction_completed",
        "gifting_mode_selected",
        "name_draw_completed",
        "group_activated",
      ];
      for (const event of catalogEvents) {
        expect(typeof surface[event], event).not.toBe("function");
      }
    });
  });
});
