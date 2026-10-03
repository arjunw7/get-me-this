// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/profile/edit-profile-action", () => ({
  editProfileAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock("@/src/analytics", () => ({
  resetAnalyticsOnLogout: vi.fn(),
  SENSITIVE_BLOCK_CLASS: "ph-no-capture",
}));

const signOutAction = vi.fn(async () => {});
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
    expect(screen.getByText("you@example.com")).toHaveAttribute(
      "data-ph-no-capture",
    );
    expect(screen.getByText("you@example.com")).toHaveClass("ph-no-capture");
    expect(screen.queryByText("Signed in as")).toBeNull();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("exposes the My wishlist entry linking to /wishlist (005b)", async () => {
    render(
      <AccountMenu
        email="you@example.com"
        displayName="Ada"
        vibe="electric"
        tasteLine="Tiny luxuries"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /account/i }));

    const link = screen.getByRole("link", { name: "My wishlist" });
    expect(link).toBeVisible();
    expect(link).toHaveAttribute("href", "/wishlist");
    await userEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    expect(
      screen.getByRole("dialog", { name: "Edit your profile" }),
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Ada");
    expect(
      screen.getByRole("textbox", { name: "Personality line" }),
    ).toHaveValue("Tiny luxuries");
    expect(screen.getByRole("radio", { name: "Electric" })).toBeChecked();
    expect(screen.queryByTestId("account-menu-content")).toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Account" })).toHaveFocus();
  });

  it("logout requires confirmation — the first click only asks", async () => {
    render(<AccountMenu email="you@example.com" displayName="Ada" />);

    await userEvent.click(screen.getByRole("button", { name: /account/i }));
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    // Confirmation state, no sign-out yet.
    expect(screen.getByText("Log out of Get Me This?")).toBeVisible();
    expect(signOutAction).not.toHaveBeenCalled();
    expect(resetAnalyticsOnLogout).not.toHaveBeenCalled();

    expect(screen.queryByTestId("account-menu-content")).toBeNull();
    expect(
      screen.getByRole("dialog", { name: "Log out of Get Me This?" }),
    ).toBeVisible();
    // Cancel keeps the session and returns to the account trigger.
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(signOutAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Account" })).toHaveFocus();
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

  it("runs a brokered logout under the origin-wide lock and settles the delivery", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const acquire = vi.fn(
      async (
        _name: string,
        callback: (lock: unknown) => Promise<void>,
      ): Promise<unknown> => {
        await callback({});
        return {};
      },
    );
    Object.defineProperty(navigator, "locks", {
      value: { request: acquire },
      configurable: true,
    });

    try {
      render(
        <AccountMenu email="you@example.com" displayName="Ada" brokered />,
      );
      await userEvent.click(screen.getByRole("button", { name: /account/i }));
      await userEvent.click(screen.getByRole("button", { name: "Log out" }));
      await userEvent.click(screen.getByRole("button", { name: "Log out" }));

      await waitFor(() => expect(signOutAction).toHaveBeenCalledTimes(1));
      expect(acquire).toHaveBeenCalledWith(
        "get-me-this:invite-mutation",
        expect.any(Function),
      );
      // The delivery is acknowledged before the lock is released.
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/auth/invite/mutation/acknowledge",
          expect.objectContaining({ method: "POST" }),
        ),
      );
    } finally {
      vi.unstubAllGlobals();
      Object.defineProperty(navigator, "locks", {
        value: undefined,
        configurable: true,
      });
    }
  });

  it("makes no sign-out call when the broker lock is unsupported", async () => {
    Object.defineProperty(navigator, "locks", {
      value: undefined,
      configurable: true,
    });
    render(<AccountMenu email="you@example.com" displayName="Ada" brokered />);

    await userEvent.click(screen.getByRole("button", { name: /account/i }));
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );

    // Without the lock the mutation never ran — never a half-applied
    // logout; the person can retry.
    expect(signOutAction).not.toHaveBeenCalled();
  });

  it("dismisses the disclosure with Escape or an outside click and restores focus", async () => {
    const user = userEvent.setup();
    render(
      <>
        <AccountMenu email="you@example.com" displayName="Ada" />
        <button type="button">Outside</button>
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Account" });
    await user.click(trigger);
    screen.getByRole("link", { name: "My wishlist" }).focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("account-menu-content")).toBeNull();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByTestId("account-menu-content")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes the disclosure when choosing My wishlist even on that same route", async () => {
    render(<AccountMenu email="you@example.com" displayName="Ada" />);
    await userEvent.click(screen.getByRole("button", { name: "Account" }));
    const link = screen.getByRole("link", { name: "My wishlist" });
    link.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(link);
    expect(screen.queryByTestId("account-menu-content")).toBeNull();
  });

  it("traps logout confirmation focus and dismisses with Escape without signing out", async () => {
    const user = userEvent.setup();
    render(<AccountMenu email="you@example.com" displayName="Ada" />);
    const trigger = screen.getByRole("button", { name: "Account" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Log out" }));
    const close = screen.getByRole("button", {
      name: "Close log out confirmation",
    });
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Log out" })).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(signOutAction).not.toHaveBeenCalled();
  });

  it("keeps an in-flight logout confirmation disabled until the action settles", async () => {
    let resolve!: () => void;
    signOutAction.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const user = userEvent.setup();
    render(<AccountMenu email="you@example.com" displayName="Ada" />);
    await user.click(screen.getByRole("button", { name: "Account" }));
    await user.click(screen.getByRole("button", { name: "Log out" }));
    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(screen.getByRole("button", { name: "Logging out…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(signOutAction).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
  });

  it("dismisses the logout sheet from its backdrop without signing out", async () => {
    const user = userEvent.setup();
    render(<AccountMenu email="you@example.com" displayName="Ada" />);
    const trigger = screen.getByRole("button", { name: "Account" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Log out" }));
    await user.click(screen.getByRole("dialog").parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(signOutAction).not.toHaveBeenCalled();
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
