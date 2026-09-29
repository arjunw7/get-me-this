// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The choice screen's form action is a server module boundary; the render
// test never fires it, so the server clients are stubbed out.
vi.mock("server-only", () => ({}));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: async () => null,
}));

import { LinkChoiceScreen } from "./link-choice-screen";
import { LinkRecoveryScreen } from "./link-recovery-screen";
import {
  confirmChangeEmailLabel,
  linkBackToCodeLabel,
  linkChoiceHeading,
  linkChoiceText,
  linkRecoveryHeading,
  linkRecoveryText,
  linkVerifyButtonLabel,
} from "./flow-copy";

/**
 * The 004d /auth/link states: the explicit-choice screen promises only the
 * explicit verification action, and the recovery screen is honest and
 * identical for every failure cause — no "signed in" claim anywhere, and
 * always a path back to code entry.
 */
describe("LinkChoiceScreen", () => {
  it("renders the explicit choice with the accessible verify control", () => {
    render(<LinkChoiceScreen />);

    expect(
      screen.getByRole("heading", { level: 1, name: linkChoiceHeading }),
    ).toBeVisible();
    expect(screen.getByText(linkChoiceText)).toBeVisible();
    expect(
      screen.getByRole("button", { name: linkVerifyButtonLabel }),
    ).toBeVisible();
    const backToCode = screen.getByRole("link", {
      name: linkBackToCodeLabel,
    });
    expect(backToCode).toHaveAttribute("href", "/auth/verify");
  });

  it("claims no completed sign-in and shows no destination promise", () => {
    render(<LinkChoiceScreen />);
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/you’re in|signed in/i);
    expect(body).not.toMatch(/wishlist|group/i);
  });
});

describe("LinkRecoveryScreen", () => {
  it("renders the honest recovery with the paths back", () => {
    render(<LinkRecoveryScreen />);

    expect(
      screen.getByRole("heading", { level: 1, name: linkRecoveryHeading }),
    ).toBeVisible();
    expect(screen.getByText(linkRecoveryText)).toBeVisible();
    expect(
      screen.getByRole("link", { name: linkBackToCodeLabel }),
    ).toHaveAttribute("href", "/auth/verify");
    expect(
      screen.getByRole("link", { name: confirmChangeEmailLabel }),
    ).toHaveAttribute("href", "/auth");
  });

  it("claims no sign-in and names no specific cause", () => {
    render(<LinkRecoveryScreen />);
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/you’re in|signed in|signing you in/i);
    // Identical for every cause: no expired/used distinction is claimed.
    expect(body).toMatch(/may have expired or already been used/i);
  });
});
