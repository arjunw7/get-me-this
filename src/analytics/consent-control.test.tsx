/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsConsentControl } from "./consent-control";
import { getAnalyticsConsent } from "./client";
import { readConsentCookie } from "./consent";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc-fixture");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.test");
  document.cookie = "gmt_analytics_consent=; Path=/; Max-Age=0";
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("analytics preferences", () => {
  it("starts pending, allows, persists across remount, and withdraws", () => {
    const view = render(<AnalyticsConsentControl />);
    expect(getAnalyticsConsent()).toBe("pending");
    fireEvent.click(screen.getByRole("button", { name: "Allow analytics" }));
    expect(getAnalyticsConsent()).toBe("granted");
    view.unmount();
    render(<AnalyticsConsentControl />);
    expect(
      screen.queryByRole("button", { name: "Allow analytics" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Analytics preferences" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Stop analytics" }));
    expect(getAnalyticsConsent()).toBe("denied");
  });
  it("denies without requiring consent to use the app", () => {
    render(<AnalyticsConsentControl />);
    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
    expect(getAnalyticsConsent()).toBe("denied");
    expect(
      screen.getByRole("button", { name: "Analytics preferences" }),
    ).toBeVisible();
  });
  it("survives unavailable local storage", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    render(<AnalyticsConsentControl />);
    fireEvent.click(screen.getByRole("button", { name: "Allow analytics" }));
    expect(getAnalyticsConsent()).toBe("granted");
    spy.mockRestore();
  });
  it("does not show when configuration is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");
    render(<AnalyticsConsentControl />);
    expect(screen.queryByLabelText("Analytics preferences")).toBeNull();
  });
  it("only reads exact consent cookie values; stale local storage grants nothing", () => {
    expect(readConsentCookie("a=b; gmt_analytics_consent=granted")).toBe(
      "granted",
    );
    expect(readConsentCookie("gmt_analytics_consent=granted-more")).toBe(
      "pending",
    );
    window.localStorage.setItem("gmt:analytics:consent", "granted");
    expect(getAnalyticsConsent()).toBe("pending");
  });
});
