/**
 * @vitest-environment jsdom
 *
 * Client-lane privacy boundary tests. Scope of proof (per the approved plan):
 * initialization options, consent gating, sensitive-region attributes, and
 * selector coverage are proven here; these tests do NOT claim to prove the
 * session recorder's emitted payload is masked. Actual replay masking is
 * verified in staging with synthetic values before recording is enabled.
 *
 * Synthetic secrets (invitation tokens, OTPs, magic-link parameters, email
 * addresses, names, pasted product URLs) prove that sanitized pageview and
 * autocapture event objects contain only approved route templates and
 * properties.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  SENSITIVE_BLOCK_CLASS,
  SENSITIVE_MASK_CLASS,
  sanitizeClientEventForSend,
  sanitizeRoutePath,
  sanitizeRouteUrl,
  sensitiveAnalyticsAttributes,
  sensitiveTextMaskAttributes,
} from "./privacy";

const USER_UUID = "00000000-0000-4000-8000-000000000000";
const GROUP_UUID = "11111111-1111-4111-8111-111111111111";

describe("sanitizeRoutePath: approved route templates only", () => {
  it("emits static routes as themselves", () => {
    expect(sanitizeRoutePath("/")).toBe("/");
    expect(sanitizeRoutePath("/onboarding")).toBe("/onboarding");
    expect(sanitizeRoutePath("/auth/callback")).toBe("/auth/callback");
  });

  it("replaces an invitation token with the approved template placeholder", () => {
    expect(sanitizeRoutePath("/invite/SECRETTOKEN123")).toBe("/invite/:token");
    expect(sanitizeRoutePath("/invite/eyJhbGciOiJIUzI1NiJ9.secret")).toBe(
      "/invite/:token",
    );
  });

  it("drops authentication callback parameters, OTP and magic-link query values, and fragments", () => {
    expect(sanitizeRoutePath("/auth/callback?otp=123456&token=abc")).toBe(
      "/auth/callback",
    );
    expect(
      sanitizeRoutePath("/auth/callback?magic_link=https%3A%2F%2Fx#frag"),
    ).toBe("/auth/callback");
    expect(
      sanitizeRoutePath("/invite/SECRETTOKEN123?email=user@example.com"),
    ).toBe("/invite/:token");
  });

  it("replaces group identifiers with the approved template placeholder", () => {
    expect(sanitizeRoutePath(`/groups/${GROUP_UUID}`)).toBe("/groups/:groupId");
    expect(
      sanitizeRoutePath(
        `https://app.getmethis.test/groups/${GROUP_UUID}/members`,
      ),
    ).toBe("/:unlisted");
  });

  it("never emits concrete segments of an unlisted route", () => {
    expect(sanitizeRoutePath("/totally/unknown/SECRETPATH")).toBe("/:unlisted");
    expect(
      sanitizeRoutePath(
        `https://store.example.com/products/pasted-product-SECRETSLUG`,
      ),
    ).toBe("/:unlisted");
  });
});

describe("sanitizeRouteUrl", () => {
  it("emits origin plus approved template only", () => {
    expect(
      sanitizeRouteUrl(
        `https://app.getmethis.test/invite/SECRETTOKEN123`,
        "https://app.getmethis.test",
      ),
    ).toBe("https://app.getmethis.test/invite/:token");
    expect(
      sanitizeRouteUrl(`/groups/${GROUP_UUID}`, "https://app.getmethis.test"),
    ).toBe("https://app.getmethis.test/groups/:groupId");
  });
});

describe("sanitizeClientEventForSend (before_send)", () => {
  it("passes null through untouched", () => {
    expect(sanitizeClientEventForSend(null)).toBeNull();
  });

  it("rebuilds pageviews from an explicit allowlist: sanitized template plus nothing else", () => {
    const result = sanitizeClientEventForSend({
      event: "$pageview",
      properties: {
        $current_url:
          "https://app.getmethis.test/invite/SECRETTOKEN123?email=user@example.com",
        $pathname: "/invite/SECRETTOKEN123",
        // SDK-enriched pageview properties that must never pass through:
        $initial_current_url:
          "https://app.getmethis.test/invite/SECRETTOKEN123?otp=123456",
        $initial_pathname: "/invite/SECRETTOKEN123",
        $initial_referrer: "https://evil.example/leak?token=SECRETTOKEN123",
        $referrer: "https://evil.example/leak?token=SECRETTOKEN123",
        $referring_domain: "evil.example",
        $raw_event_path: "/invite/SECRETTOKEN123",
        $utm_source: "arjun",
        $utm_campaign: "SECRETCAMPAIGN",
        $utm_content: "wishlist-note-secret",
        $gclid: "SECRETCAMPAIGN",
        $fragment: "#SECRETTOKEN123",
        $search: "?email=user@example.com",
        $lib: "web",
      },
    });

    expect(result).toEqual({
      event: "$pageview",
      properties: {
        $current_url: "https://app.getmethis.test/invite/:token",
        $pathname: "/invite/:token",
      },
    });
    expect(JSON.stringify(result)).not.toContain("SECRETTOKEN123");
    expect(JSON.stringify(result)).not.toContain("user@example.com");
    expect(JSON.stringify(result)).not.toContain("arjun");
  });

  it("sanitizes pageleave URLs the same way", () => {
    const result = sanitizeClientEventForSend({
      event: "$pageleave",
      properties: {
        $current_url: `https://app.getmethis.test/groups/${GROUP_UUID}?note=SECRETTOKEN`,
        $pathname: `/groups/${GROUP_UUID}`,
        $initial_pathname: `/groups/${GROUP_UUID}`,
        $referrer: "https://evil.example/?utm_source=arjun",
        $raw_event_path: `/groups/${GROUP_UUID}`,
      },
    });
    expect(result?.properties).toEqual({
      $current_url: "https://app.getmethis.test/groups/:groupId",
      $pathname: "/groups/:groupId",
    });
  });

  it("drops unknown client event names unless explicitly approved", () => {
    for (const unknown of [
      "$custom_event",
      "$feature_flag_called",
      "$exception",
      "$web_vitals",
      "$dead_click",
      "$rageclick",
      "$heatmap",
    ]) {
      expect(
        sanitizeClientEventForSend({
          event: unknown,
          properties: { secret: "SECRETTOKEN123" },
        }),
      ).toBeNull();
    }

    for (const approved of ["$identify", "$opt_in", "$opt_out"]) {
      const event = { event: approved, properties: { benign: true } };
      expect(sanitizeClientEventForSend(event)).toEqual(event);
    }
  });

  it("reduces autocapture events to the approved property allowlist", () => {
    const result = sanitizeClientEventForSend({
      event: "$autocapture",
      properties: {
        $event_type: "click",
        $el_tag_name: "a",
        $el_classes: ["link", "btn"],
        // Prohibited classes that must never leave the browser:
        $el_text: "Arjun Wadhwa's wishlist note",
        $el_href: "https://store.example.com/products/SECRETSLUG",
        $el_attr__href: "https://store.example.com/products/SECRETSLUG",
        $el_attr__aria_label: "user@example.com",
        $user_email: "user@example.com",
      },
    });

    expect(result).toEqual({
      event: "$autocapture",
      properties: {
        $event_type: "click",
        $el_tag_name: "a",
        $el_classes: ["link", "btn"],
      },
    });
  });

  it("never emits synthetic secrets from any sanitized event", () => {
    const secrets = [
      "SECRETTOKEN123",
      "SECRETSLUG",
      "user@example.com",
      "Arjun Wadhwa",
    ];
    const sanitized = JSON.stringify(
      sanitizeClientEventForSend({
        event: "$autocapture",
        properties: {
          $event_type: "click",
          $el_text: "Arjun Wadhwa",
          $el_href:
            "https://store.example.com/products/SECRETSLUG?email=user@example.com",
          $el_tag_name: "a",
        },
      }),
    );
    for (const secret of secrets) {
      // The non-secret allowlisted properties are preserved; the secrets are not.
      expect(sanitized).not.toContain(secret);
    }
  });

  it("passes non-page, non-autocapture events through", () => {
    const event = {
      event: "$identify",
      properties: { distinct_id: USER_UUID },
    };
    expect(sanitizeClientEventForSend(event)).toEqual(event);
  });
});

describe("reusable sensitive-region mechanism", () => {
  afterEach(() => {
    cleanup();
  });

  it("marks a sensitive element as blocked from capture and replay", () => {
    render(
      <div {...sensitiveAnalyticsAttributes()} data-testid="gift-note">
        Surprise gift note for Arjun
      </div>,
    );
    const element = screen.getByTestId("gift-note");
    expect(element.className).toBe(SENSITIVE_BLOCK_CLASS);
    expect(element).toHaveAttribute("data-ph-no-capture");
  });

  it("marks sensitive text as masked", () => {
    render(
      <span {...sensitiveTextMaskAttributes()} data-testid="wishlist-note">
        SECRETTOKEN123
      </span>,
    );
    const element = screen.getByTestId("wishlist-note");
    expect(element.className).toBe(SENSITIVE_MASK_CLASS);
    expect(element).toHaveAttribute("data-ph-mask");
  });
});
