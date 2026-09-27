// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VerifyScreen } from "./verify-screen";
import { previewNotice } from "./copy";
import { DEMO_CODE, RESEND_SECONDS } from "./fixtures";

/**
 * The static verify screen: every designed state is a URL fixture, the
 * preview notice is permanently visible, and no interaction claims a
 * delivery, verification, or completed sign-in.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe("VerifyScreen", () => {
  it("renders the default state with an empty code and the countdown at its deterministic initial value", () => {
    render(<VerifyScreen variant="default" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Check your inbox." }),
    ).toBeVisible();
    expect(screen.getByText(`Resend code in 0:30`)).toBeVisible();
    expect(screen.getByText(previewNotice)).toBeVisible();
    for (let i = 0; i < 6; i++) {
      expect(
        screen.getByRole("textbox", { name: `Digit ${i + 1} of 6` }),
      ).toHaveValue("");
    }
  });

  it("renders the error fixture with the demo code prefilled and the designed mismatch alert", () => {
    render(<VerifyScreen variant="error" />);

    // role="alert" names are author-only, so the alert is found by role and
    // its copy is asserted directly.
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/that code doesn’t match/i);
    expect(screen.getByRole("textbox", { name: "Digit 1 of 6" })).toHaveValue(
      DEMO_CODE[0],
    );
  });

  it("renders the expired fixture with the recovery panel and inputs disabled", () => {
    render(<VerifyScreen variant="expired" />);

    expect(screen.getByText("That code has expired.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Send a new code" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("textbox", { name: "Digit 1 of 6" }),
    ).toBeDisabled();
    // Countdown elapsed: the resend control is the active link, not a timer.
    expect(screen.queryByText(/Resend code in/)).toBeNull();
  });

  it("shows the designed short-code error for an incomplete submission", async () => {
    render(<VerifyScreen variant="default" />);

    await userEvent.click(
      screen.getByRole("button", { name: "Verify and continue" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /enter all six digits/i,
    );
  });

  it("submits a complete code to nothing: no claim, no error, the notice remains the only word on the outcome", async () => {
    render(<VerifyScreen variant="default" />);

    await userEvent.click(
      screen.getByRole("textbox", { name: "Digit 1 of 6" }),
    );
    await userEvent.paste(DEMO_CODE);
    await userEvent.click(
      screen.getByRole("button", { name: "Verify and continue" }),
    );

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(previewNotice)).toBeVisible();
  });

  it("resends without any delivery claim: the countdown resets visibly", async () => {
    render(<VerifyScreen variant="expired" />);

    await userEvent.click(
      screen.getByRole("button", { name: "Send a new code" }),
    );

    expect(screen.getByText(`Resend code in 0:30`)).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ticks the countdown down from its deterministic initial value under controlled time", () => {
    vi.useFakeTimers();
    render(<VerifyScreen variant="default" />);
    // One act step per second: each tick re-renders and schedules the next.
    const tick = () => act(() => vi.advanceTimersByTime(1000));

    expect(screen.getByText(`Resend code in 0:30`)).toBeVisible();
    tick();
    expect(screen.getByText(`Resend code in 0:29`)).toBeVisible();
    for (let i = 0; i < 29; i++) tick();
    expect(screen.getByRole("button", { name: "Resend code" })).toBeEnabled();
  });

  it("keeps the countdown bounded by its deterministic initial value", () => {
    vi.useFakeTimers();
    render(<VerifyScreen variant="default" />);
    const tick = () => act(() => vi.advanceTimersByTime(1000));

    for (let i = 0; i < RESEND_SECONDS + 5; i++) tick();
    expect(screen.getByRole("button", { name: "Resend code" })).toBeVisible();
    expect(screen.queryByText(/Resend code in/)).toBeNull();
  });

  it("links back to email entry from both the header and the card", () => {
    render(<VerifyScreen variant="default" />);

    const changeEmailLinks = screen.getAllByRole("link", {
      name: "Change email",
    });
    expect(changeEmailLinks).toHaveLength(2);
    for (const link of changeEmailLinks) {
      expect(link).toHaveAttribute("href", "/auth");
    }
  });
});
