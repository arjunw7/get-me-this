// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { dashboardHref, dashboardLabel, loginHref } from "./content";
import { LandingPage } from "./landing-page";

/**
 * ARJ-54: the landing header reflects the persisted session — a signed-in
 * visitor gets the Dashboard entry to /home instead of the Log in anchor,
 * while the signed-out render stays identical to the committed baseline.
 */
describe("LandingPage session-aware nav (ARJ-54)", () => {
  it("offers the signed-out visitor Log in and no Dashboard entry", () => {
    render(<LandingPage />);

    const login = screen.getByRole("link", { name: "Log in" });
    expect(login).toHaveAttribute("href", loginHref);
    expect(
      screen.queryByRole("link", { name: dashboardLabel }),
    ).not.toBeInTheDocument();
  });

  it("swaps Log in for a Dashboard entry when a session is live", () => {
    render(<LandingPage signedIn />);

    const dashboard = screen.getByRole("link", { name: dashboardLabel });
    expect(dashboard).toHaveAttribute("href", dashboardHref);
    expect(
      screen.queryByRole("link", { name: "Log in" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the signed-out confirmation behaviour unchanged", () => {
    render(<LandingPage loggedOut />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "You’re logged out. See you soon.",
    );
    expect(screen.getByRole("link", { name: "Log in" })).toBeVisible();
  });
});
