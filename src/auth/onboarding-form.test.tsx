// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { OnboardingForm } from "./onboarding-form";
import { previewNotice } from "./copy";
import { TASTE_LINE_MAX } from "./fixtures";

/**
 * The static onboarding form: display name required (designed validation),
 * optional one-line taste field with toggle chips, honest submit. No
 * profile is saved and nothing navigates.
 */

describe("OnboardingForm", () => {
  it("renders the default state with an empty form", () => {
    render(<OnboardingForm variant="default" />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Tell friends who you are.",
      }),
    ).toBeVisible();
    expect(screen.getByLabelText("What should friends call you?")).toHaveValue(
      "",
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(previewNotice)).toBeNull();
  });

  it("renders the validation fixture directly: touched, empty name, designed error", () => {
    render(<OnboardingForm variant="validation" />);

    const name = screen.getByLabelText("What should friends call you?");
    expect(name).toHaveAttribute("aria-invalid", "true");
    // role="alert" names are author-only; assert the copy directly.
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Friends need something to call you.",
    );
  });

  it("shows the designed validation error on submitting an empty name", async () => {
    render(<OnboardingForm variant="default" />);

    await userEvent.click(screen.getByRole("button", { name: /let’s go/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Friends need something to call you.",
    );
  });

  it("keeps the error visible when a touched name is emptied again", async () => {
    render(<OnboardingForm variant="default" />);
    const name = screen.getByLabelText("What should friends call you?");

    await userEvent.type(name, "Arjun");
    await userEvent.click(screen.getByRole("button", { name: /let’s go/i }));
    expect(screen.queryByRole("alert")).toBeNull();

    await userEvent.clear(name);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Friends need something to call you.",
    );
  });

  it("submits a valid form to nothing: the notice appears and no navigation is claimed", async () => {
    render(<OnboardingForm variant="default" />);

    await userEvent.type(
      screen.getByLabelText("What should friends call you?"),
      "Arjun",
    );
    await userEvent.click(screen.getByRole("button", { name: /let’s go/i }));

    expect(screen.getByText(previewNotice)).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("toggles suggestion chips with aria-pressed and fills the line", async () => {
    render(<OnboardingForm variant="default" />);
    const line = screen.getByLabelText(/describe your taste in one line/i);

    const chip = screen.getByRole("button", {
      name: "will travel for good coffee",
    });
    expect(chip).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(chip);
    expect(line).toHaveValue("will travel for good coffee");
    expect(chip).toHaveAttribute("aria-pressed", "true");

    // Re-tapping the same chip keeps it selected (it re-sets the same line).
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the character counter against the fixed limit", async () => {
    render(<OnboardingForm variant="default" />);
    const line = screen.getByLabelText(/describe your taste in one line/i);

    expect(screen.getByText(`0/${TASTE_LINE_MAX}`)).toBeVisible();
    await userEvent.type(line, "tea");
    expect(screen.getByText(`3/${TASTE_LINE_MAX}`)).toBeVisible();
  });

  it("clamps the line to the fixed limit", async () => {
    render(<OnboardingForm variant="default" />);
    const line = screen.getByLabelText(/describe your taste in one line/i);

    await userEvent.click(line);
    await userEvent.paste("x".repeat(80));
    expect(line).toHaveValue("x".repeat(TASTE_LINE_MAX));
    expect(
      screen.getByText(`${TASTE_LINE_MAX}/${TASTE_LINE_MAX}`),
    ).toBeVisible();
  });

  it("links back to the landing page", () => {
    render(<OnboardingForm variant="default" />);

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
