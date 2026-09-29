// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConfirmScreen } from "./confirm-screen";
import {
  confirmBackToCodeLabel,
  confirmChangeEmailLabel,
  confirmInterimHeading,
  confirmInterimText,
} from "./flow-copy";

/**
 * The interim /auth/confirm state (004c): the route's ONLY state. It must
 * not claim a completed sign-in, must not load forever, must carry a clear
 * not-yet message, and must offer the path back to code entry. The old
 * fixture frames (loading / valid / expired) are gone — a success frame on
 * a route that never verifies would be a false "signed in".
 */
describe("ConfirmScreen (interim)", () => {
  it("renders the honest interim state with the path back to code entry", () => {
    render(<ConfirmScreen />);

    expect(
      screen.getByRole("heading", { level: 1, name: confirmInterimHeading }),
    ).toBeVisible();
    expect(screen.getByText(confirmInterimText)).toBeVisible();

    const backToCode = screen.getByRole("link", {
      name: confirmBackToCodeLabel,
    });
    expect(backToCode).toHaveAttribute("href", "/auth/verify");
    const differentEmail = screen.getByRole("link", {
      name: confirmChangeEmailLabel,
    });
    expect(differentEmail).toHaveAttribute("href", "/auth");
  });

  it("makes no completed-sign-in, loading, or expired claim", () => {
    render(<ConfirmScreen />);
    const body = document.body.textContent ?? "";

    expect(body).not.toMatch(/you’re in|signed in|signing you in/i);
    expect(body).not.toMatch(/this link has expired/i);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("never invites the emailed sign-in link", () => {
    render(<ConfirmScreen />);
    const body = document.body.textContent ?? "";
    // Only the honest not-yet mention of the link is allowed.
    expect(body).toMatch(/isn’t active yet/i);
    expect(body).not.toMatch(/tap the sign-in|either works|the link works/i);
  });
});
