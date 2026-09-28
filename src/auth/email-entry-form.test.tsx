// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmailEntryForm } from "./email-entry-form";
import { INTENT_NOTES } from "./fixtures";

/**
 * The intent variants render the reference's helper copy; the `home`
 * intent renders the 003a default state exactly (no note), keeping the
 * approved `auth-home` baselines valid.
 */

describe("EmailEntryForm intent variants", () => {
  it("renders no note for the home intent (the 003a default)", () => {
    render(<EmailEntryForm intentNote={INTENT_NOTES.home} />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Welcome to Get Me This.",
      }),
    ).toBeVisible();
    expect(
      screen.queryByText(
        "First, a quick sign-in. Then you’ll add your first item.",
      ),
    ).toBeNull();
  });

  it("renders the wishlist intent note", () => {
    render(<EmailEntryForm intentNote={INTENT_NOTES.wishlist} />);

    expect(
      screen.getByText(
        "First, a quick sign-in. Then you’ll add your first item.",
      ),
    ).toBeVisible();
  });

  it("renders the create-group intent note", () => {
    render(<EmailEntryForm intentNote={INTENT_NOTES["create-group"]} />);

    expect(
      screen.getByText(
        "First, a quick sign-in. Then you’ll set up your group.",
      ),
    ).toBeVisible();
  });
});
