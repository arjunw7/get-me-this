// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmScreen } from "./confirm-screen";
import { previewNotice } from "./copy";

/**
 * Every confirm state renders DIRECTLY from its URL fixture. No timer,
 * animation, or transition may gate application state: advancing time
 * must not change the rendered frame, and the preview notice is visible
 * in every frame so no state can read as a completed sign-in.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe("ConfirmScreen", () => {
  it("renders the loading frame for the loading fixture", () => {
    render(<ConfirmScreen variant="loading" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Signing you in…" }),
    ).toBeVisible();
    expect(screen.getByText(previewNotice)).toBeVisible();
  });

  it("renders the success frame directly for the valid fixture, with the notice beside the success copy", () => {
    render(<ConfirmScreen variant="valid" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "You’re in." }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "In the real product, this takes you where you were headed.",
      ),
    ).toBeVisible();
    // The pending copy exception: the notice must sit in the same frame as
    // the success copy so the state cannot imply a completed sign-in.
    expect(screen.getByText(previewNotice)).toBeVisible();
  });

  it("renders the recovery frame directly for the expired fixture with both designed paths", () => {
    render(<ConfirmScreen variant="expired" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "This link has expired." }),
    ).toBeVisible();
    // Honest journey label: V18's "Send a new email" promised delivery;
    // here the action only navigates to the code screen.
    const sendNew = screen.getByRole("link", {
      name: "Try again with a new code",
    });
    expect(sendNew).toHaveAttribute("href", "/auth/verify");
    const different = screen.getByRole("link", {
      name: "Use a different email",
    });
    expect(different).toHaveAttribute("href", "/auth");
    expect(screen.getByText(previewNotice)).toBeVisible();
  });

  it("never transitions on a timer: the loading frame is stable across controlled time", () => {
    vi.useFakeTimers();
    render(<ConfirmScreen variant="loading" />);

    vi.advanceTimersByTime(10_000);
    expect(
      screen.getByRole("heading", { level: 1, name: "Signing you in…" }),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: "You’re in." })).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "This link has expired." }),
    ).toBeNull();
  });

  it("claims no completed sign-in in any state: the notice is always present", () => {
    for (const variant of ["loading", "valid", "expired"] as const) {
      const { unmount } = render(<ConfirmScreen variant={variant} />);
      expect(screen.getByText(previewNotice)).toBeVisible();
      unmount();
    }
  });

  it("makes no delivery promise in any rendered state (review regression)", () => {
    for (const variant of ["loading", "valid", "expired"] as const) {
      const { unmount } = render(<ConfirmScreen variant={variant} />);
      const body = document.body.textContent ?? "";
      // V18's delivery-promising copy ("We'll send…", "Send a new email")
      // must never return: the preview sends nothing.
      expect(body).not.toMatch(
        /we('|\u2019)?ll send|send a new (code|email)|code sent|sending\u2026/i,
      );
      unmount();
    }
  });
});
