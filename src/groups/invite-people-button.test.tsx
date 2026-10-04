// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InvitePeopleButton } from "./invite-people-button";

const ready = {
  ok: true as const,
  token: "A".repeat(43),
  version: "1",
  expiresAt: "2026-11-01T00:00:00Z",
};
function setup(result: unknown = ready) {
  const load = vi.fn().mockResolvedValue(result);
  const replace = vi.fn().mockResolvedValue(ready);
  render(
    <InvitePeopleButton
      groupId="group-1"
      groupName="Santa Party 🎉"
      inviteActions={{ load, replace }}
    />,
  );
  return { load, replace };
}

describe("Invite people modal", () => {
  it("loads on opening and displays only the link and two sharing actions", async () => {
    const user = userEvent.setup();
    const { load, replace } = setup();
    expect(load).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Invite people" }));
    const dialog = screen.getByRole("dialog", {
      name: "Santa Party 🎉 is ready.",
    });
    const input = await screen.findByRole("textbox", { name: "Invite link" });
    const url = `${window.location.origin}/invite/${ready.token}`;
    expect(input).toHaveValue(url);
    expect(within(dialog).getAllByRole("button")).toHaveLength(2); // Close + copy.
    const whatsapp = within(dialog).getByRole("link", {
      name: "Share on WhatsApp",
    });
    expect(
      new URL(whatsapp.getAttribute("href")!).searchParams.get("text"),
    ).toBe(`Join Santa Party 🎉 on Get Me This: ${url}`);
    expect(whatsapp).toHaveAttribute("rel", "noopener noreferrer");
    await user.click(screen.getByRole("button", { name: "Copy invite link" }));
    expect(await navigator.clipboard.readText()).toBe(url);
    expect(screen.getByRole("status")).toHaveTextContent("Invite link copied");
    expect(replace).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite people" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Invite people" }));
    expect(await screen.findByRole("textbox")).toHaveValue(url);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("preserves old invitations until explicit replacement confirmation", async () => {
    const user = userEvent.setup();
    const { replace } = setup({
      ok: false,
      reason: "replacement_required",
      version: "7",
    });
    await user.click(screen.getByRole("button", { name: "Invite people" }));
    await screen.findByText(/stop the old link from working/);
    expect(replace).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Create a new invite link" }),
    );
    expect(replace).toHaveBeenCalledWith("group-1", "7");
    expect(await screen.findByRole("textbox")).toHaveValue(
      `${window.location.origin}/invite/${ready.token}`,
    );
  });

  it("recovers a stale replacement by loading the winning link", async () => {
    const user = userEvent.setup();
    const { replace, load } = setup({
      ok: false,
      reason: "replacement_required",
      version: "7",
    });
    replace.mockResolvedValue({ ok: false, reason: "stale" });
    await user.click(screen.getByRole("button", { name: "Invite people" }));
    await screen.findByText(/stop the old link/);
    load.mockResolvedValue(ready);
    await user.click(
      screen.getByRole("button", { name: "Create a new invite link" }),
    );
    expect(await screen.findByRole("textbox")).toBeVisible();
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("shows honest retry failure and does not expose links after denial", async () => {
    const user = userEvent.setup();
    const { load } = setup();
    load.mockRejectedValueOnce(new Error("offline"));
    await user.click(screen.getByRole("button", { name: "Invite people" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "couldn’t be loaded",
    );
    load.mockResolvedValue({ ok: false, reason: "unavailable" });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "no longer have access",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("contains keyboard focus and allows manual copy after clipboard failure", async () => {
    const user = userEvent.setup();
    setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
      new Error("denied"),
    );
    await user.click(screen.getByRole("button", { name: "Invite people" }));
    await screen.findByRole("textbox");
    const close = screen.getByRole("button", { name: "Close invite dialog" });
    close.focus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(
      screen.getByRole("link", { name: "Share on WhatsApp" }),
    ).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(close).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Copy invite link" }));
    expect(screen.getByRole("status")).toHaveTextContent("Select and copy");
    expect(screen.getByRole("textbox")).toHaveFocus();
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
