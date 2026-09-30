// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/analytics", () => ({
  resetAnalyticsOnLogout: vi.fn(),
  SENSITIVE_BLOCK_CLASS: "ph-no-capture",
}));

const signOutAction = vi.fn();
vi.mock("@/src/auth/actions", () => ({
  signOutAction: () => signOutAction(),
}));

import { AccountMenu } from "./account-menu";
import { resetAnalyticsOnLogout } from "@/src/analytics";
import { loggedOutConfirmation } from "@/src/auth/flow-copy";

const resetMock = vi.mocked(resetAnalyticsOnLogout);
const signOutMock = signOutAction as unknown as ReturnType<typeof vi.fn>;

/**
 * The honest minimal account menu (004e): the signed-in email, a
 * confirmation-gated logout, and the analytics identity reset BEFORE the
 * session clears.
 */

describe("AccountMenu", () => {
  it("shows the signed-in email and a Log out control", async () => {
    render(<AccountMenu email="you@example.com" displayName="Ada" />);

    await userEvent.click(screen.getByRole("button", { name: /account/i }));

    expect(screen.getByText("you@example.com")).toBeVisible();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("exposes the My wishlist entry linking to /wishlist (005b)", async () => {
    render(<AccountMenu email="you@example.com" displayName="Ada" />);

    await userEvent.click(screen.getByRole("button", { name: /account/i }));

    const link = screen.getByRole("link", { name: "My wishlist" });
    expect(link).toBeVisible();
    expect(link).toHaveAttribute("href", "/wishlist");
    // Edit profile remains deferred (no route yet).
    expect(
      screen.queryByRole("link", { name: "Edit profile" }),
    ).not.toBeInTheDocument();
  });

  it("logout requires confirmation — the first click only asks", async () => {
    render(<AccountMenu email="you@example.com" displayName="Ada" />);

    await userEvent.click(screen.getByRole("button", { name: /account/i }));
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    // Confirmation state, no sign-out yet.
    expect(screen.getByText("Log out of Get Me This?")).toBeVisible();
    expect(signOutAction).not.toHaveBeenCalled();
    expect(resetAnalyticsOnLogout).not.toHaveBeenCalled();

    // Cancel keeps the session and the menu.
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(signOutAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("confirming resets the analytics identity before clearing the session", async () => {
    render(<AccountMenu email="you@example.com" displayName="Ada" />);

    await userEvent.click(screen.getByRole("button", { name: /account/i }));
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    // The confirmation replaced the menu body: the remaining Log out
    // button is the confirm control.
    const confirmButton = screen.getByRole("button", { name: "Log out" });
    await userEvent.click(confirmButton);

    expect(resetAnalyticsOnLogout).toHaveBeenCalledTimes(1);
    expect(signOutAction).toHaveBeenCalledTimes(1);
    // Order matters: the identity reset happens BEFORE the session clears.
    expect(resetMock.mock.invocationCallOrder[0]).toBeLessThan(
      signOutMock.mock.invocationCallOrder[0],
    );
  });

  it("pins the approved logged-out landing copy", () => {
    expect(loggedOutConfirmation).toBe("You’re logged out. See you soon.");
  });

  it("renders nothing until opened, so the default Home chrome is quiet", async () => {
    render(<AccountMenu email="you@example.com" displayName="Ada" />);
    expect(screen.queryByText("you@example.com")).toBeNull();
    await waitFor(() =>
      expect(
        screen.queryByText("Log out of Get Me This?"),
      ).not.toBeInTheDocument(),
    );
  });
});
