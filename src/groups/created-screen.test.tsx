// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
const actions = vi.hoisted(() => ({ load: vi.fn(), replace: vi.fn() }));
vi.mock("./invitation-actions", () => ({
  getGroupInviteLinkAction: actions.load,
  issueGroupInviteLinkAction: actions.replace,
}));
import { CreatedScreen } from "./created-screen";
const groupId = "00000000-0000-4000-8000-0000000000b0";
afterEach(() => vi.clearAllMocks());
it("shows two primary actions with Home below and never loads an invite on render", () => {
  render(<CreatedScreen groupId={groupId} groupName="Rohan turns 27" />);
  expect(
    screen.getByRole("heading", { name: "Rohan turns 27 is ready." }),
  ).toBeVisible();
  const invite = screen.getByRole("button", { name: "Invite people" });
  const open = screen.getByRole("link", { name: "Open group" });
  expect(open).toHaveAttribute("href", `/groups/${groupId}`);
  expect(invite.parentElement).toBe(open.parentElement);
  expect(invite.parentElement).toHaveClass("grid-cols-2");
  expect(open).toHaveClass("bg-surface-raised", "text-content-primary");
  expect(screen.getByRole("link", { name: "Go to home" })).toHaveAttribute(
    "href",
    "/home",
  );
  expect(
    screen.queryByRole("link", { name: /wishlist/i }),
  ).not.toBeInTheDocument();
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(actions.load).not.toHaveBeenCalled();
});
it("opens the same invitation modal and restores focus when it closes", async () => {
  const user = userEvent.setup();
  actions.load.mockResolvedValue({
    ok: true,
    token: "A".repeat(43),
    version: "1",
    expiresAt: "2050-01-01T00:00:00Z",
  });
  render(<CreatedScreen groupId={groupId} groupName="Rohan turns 27" />);
  const invite = screen.getByRole("button", { name: "Invite people" });
  await user.click(invite);
  const dialog = screen.getByRole("dialog", {
    name: "Rohan turns 27 is ready.",
  });
  expect(
    await within(dialog).findByRole("textbox", { name: "Invite link" }),
  ).toBeVisible();
  expect(actions.load).toHaveBeenCalledWith(groupId);
  expect(
    within(dialog).getByRole("link", { name: "Share on WhatsApp" }),
  ).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(invite).toHaveFocus();
});
