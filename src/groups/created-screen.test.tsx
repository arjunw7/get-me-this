// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Component coverage for the organizer-only created screen (brief 006b): all
 * invitation states, confirmation gating, one-time in-memory token handling,
 * stale-version recovery, clipboard success/failure, authoritative expiry,
 * and no issuance on render.
 */

import { CreatedScreen, inviteUrl } from "./created-screen";

const issueAction = vi.fn();
const refreshAction = vi.fn();

const GROUP_ID = "00000000-0000-4000-8000-0000000000b0";
const TOKEN = "A".repeat(43);

function initialState(
  state: "never_issued" | "active" | "issued_expired" | "revoked",
  version = "0",
  expiresAt: string | null = null,
) {
  return { version, state, expiresAt };
}

function renderScreen(
  initial = initialState("never_issued"),
  groupName = "Rohan turns 27",
) {
  return render(
    <CreatedScreen
      groupId={GROUP_ID}
      groupName={groupName}
      initialState={initial}
      issueAction={issueAction}
      refreshAction={refreshAction}
    />,
  );
}

const futureExpiry = "2026-12-20T10:00:00.000Z";
const pastExpiry = "2026-01-20T10:00:00.000Z";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CreatedScreen", () => {
  it("renders the success heading and actions without issuing on mount", () => {
    renderScreen();
    expect(screen.getByText("Rohan turns 27 is ready.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Add to my wishlist" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to home" })).toBeTruthy();
    expect(issueAction).not.toHaveBeenCalled();
    expect(screen.queryByTestId("invite-link-card")).toBeNull();
  });

  it("the never-issued state offers Create invite link", () => {
    renderScreen();
    expect(
      screen.getByRole("button", { name: "Create invite link" }),
    ).toBeTruthy();
  });

  it("the explicit issuance shows the token, expiry, and share actions", async () => {
    const user = userEvent.setup();
    issueAction.mockResolvedValue({
      ok: true,
      token: TOKEN,
      version: "1",
      expiresAt: futureExpiry,
    });
    renderScreen();
    await user.click(
      screen.getByRole("button", { name: "Create invite link" }),
    );
    await waitFor(() => {
      expect(issueAction).toHaveBeenCalledWith(GROUP_ID, "0");
    });
    const card = await screen.findByTestId("invite-link-card");
    expect(card).toBeTruthy();
    // The link is the opaque token route, never a name-derived slug.
    expect(screen.getByText(inviteUrl(TOKEN))).toBeTruthy();
    expect(screen.getByText(/expires/i)).toBeTruthy();
    expect(screen.queryByText(TOKEN)).toBeNull();
  });

  it("copy success announces and copy failure keeps the selectable link", async () => {
    const user = userEvent.setup();
    issueAction.mockResolvedValue({
      ok: true,
      token: TOKEN,
      version: "1",
      expiresAt: futureExpiry,
    });
    renderScreen();
    await user.click(
      screen.getByRole("button", { name: "Create invite link" }),
    );
    await screen.findByTestId("invite-link-card");

    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    await user.click(screen.getByRole("button", { name: "Copy invite link" }));
    expect(await screen.findByText(/copying failed/i)).toBeTruthy();
    // The only displayed token was never cleared.
    expect(screen.getByTestId("invite-link-card")).toBeTruthy();
    expect(screen.getByText(inviteUrl(TOKEN))).toBeTruthy();

    writeText.mockResolvedValue(undefined);
    await user.click(screen.getByRole("button", { name: "Copy invite link" }));
    expect(await screen.findByText("Invite link copied")).toBeTruthy();
  });

  it("WhatsApp opens only from the user's click with noopener", async () => {
    issueAction.mockResolvedValue({
      ok: true,
      token: TOKEN,
      version: "1",
      expiresAt: futureExpiry,
    });
    const user = userEvent.setup();
    renderScreen();
    await user.click(
      screen.getByRole("button", { name: "Create invite link" }),
    );
    await screen.findByTestId("invite-link-card");
    const whatsapp = screen.getByRole("link", {
      name: "Share on WhatsApp",
    }) as HTMLAnchorElement;
    expect(whatsapp.rel).toContain("noopener");
    expect(whatsapp.rel).toContain("noreferrer");
    expect(whatsapp.href.startsWith("https://wa.me/?text=")).toBe(true);
  });

  it("the active-link-lost state requires confirmation before replacement", async () => {
    const user = userEvent.setup();
    renderScreen(initialState("active", "1", futureExpiry));
    expect(await screen.findByTestId("active-link-lost")).toBeTruthy();
    expect(
      screen.getByText(/shown only once and cannot be recovered/i),
    ).toBeTruthy();
    expect(screen.getByText(/expires/i)).toBeTruthy();
    expect(issueAction).not.toHaveBeenCalled();

    // Confirm, then issue at the projected version.
    issueAction.mockResolvedValue({
      ok: true,
      token: TOKEN,
      version: "2",
      expiresAt: futureExpiry,
    });
    await user.click(
      screen.getByRole("button", { name: "Create a new invite link" }),
    );
    expect(await screen.findByTestId("replacement-confirmation")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Yes, create a new link" }),
    );
    await waitFor(() => {
      expect(issueAction).toHaveBeenCalledWith(GROUP_ID, "1");
    });
    await screen.findByTestId("invite-link-card");
  });

  it("the issued-expired state shows the authoritative stored expiry and never collapses into never-issued", () => {
    renderScreen(initialState("issued_expired", "3", pastExpiry));
    expect(screen.getByTestId("issued-expired")).toBeTruthy();
    expect(screen.getByText(/expired/i)).toBeTruthy();
    expect(screen.queryByText(/create invite link$/i)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Create a new invite link" }),
    ).toBeTruthy();
  });

  it("the revoked state offers Create invite link with no recoverable token", () => {
    renderScreen(initialState("revoked", "4"));
    expect(
      screen.getByRole("button", { name: "Create invite link" }),
    ).toBeTruthy();
    expect(screen.queryByTestId("invite-link-card")).toBeNull();
    expect(screen.queryByText(TOKEN)).toBeNull();
  });

  it("a stale issuance refreshes state and never retries automatically", async () => {
    const user = userEvent.setup();
    issueAction.mockResolvedValue({ ok: false, reason: "stale" });
    refreshAction.mockResolvedValue({
      ok: true,
      version: "2",
      state: "active",
      expiresAt: futureExpiry,
    });
    renderScreen();
    await user.click(
      screen.getByRole("button", { name: "Create invite link" }),
    );
    await waitFor(() => {
      expect(refreshAction).toHaveBeenCalledWith(GROUP_ID);
    });
    // Exactly one issuance attempt; no automatic retry.
    expect(issueAction).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("active-link-lost")).toBeTruthy();
    expect(await screen.findByTestId("stale-version-note")).toBeTruthy();
    expect(screen.queryByText(TOKEN)).toBeNull();
  });

  it("an ambiguous issuance response also refreshes without retrying", async () => {
    const user = userEvent.setup();
    issueAction.mockResolvedValue({ ok: false, reason: "retry" });
    refreshAction.mockResolvedValue({
      ok: true,
      version: "2",
      state: "revoked",
      expiresAt: null,
    });
    renderScreen();
    await user.click(
      screen.getByRole("button", { name: "Create invite link" }),
    );
    await waitFor(() => {
      expect(refreshAction).toHaveBeenCalledWith(GROUP_ID);
    });
    expect(issueAction).toHaveBeenCalledTimes(1);
    await screen.findByTestId("stale-version-note");
  });

  it("the expiry is rendered from the authoritative stored value after mount", async () => {
    issueAction.mockResolvedValue({
      ok: true,
      token: TOKEN,
      version: "1",
      expiresAt: futureExpiry,
    });
    const user = userEvent.setup();
    renderScreen();
    await user.click(
      screen.getByRole("button", { name: "Create invite link" }),
    );
    await screen.findByTestId("invite-link-card");
    await waitFor(() => {
      expect(screen.getByText(/expires/i).textContent).toMatch(/20\d\d/);
    });
  });
});
