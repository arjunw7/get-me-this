// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), pending: false }));
vi.mock("@/src/profile/session", () => ({ getSessionUser: mocks.user }));
vi.mock("./invite-actions", () => ({ discardProvenFlowsAction: vi.fn() }));
vi.mock("next/link", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/link")>()),
  useLinkStatus: () => ({ pending: mocks.pending }),
}));
import InviteUnavailablePage from "@/app/invite/unavailable/page";
afterEach(() => {
  cleanup();
  mocks.pending = false;
});
it.each([
  [null, "/"],
  [{ id: "member", email: null }, "/home"],
])(
  "returns directly to the verified session's destination",
  async (user, href) => {
    mocks.user.mockResolvedValue(user);
    render(await InviteUnavailablePage());
    const link = screen.getByRole("link", { name: "Back to Get Me This" });
    expect(link).toHaveAttribute("href", href);
    expect(link.querySelector("button")).toBeNull();
    expect(link).toHaveClass("cursor-pointer");
  },
);
it("announces navigation while the recovery destination is loading", async () => {
  mocks.user.mockResolvedValue(null);
  mocks.pending = true;
  render(await InviteUnavailablePage());
  expect(screen.getByRole("status")).toHaveTextContent("Opening…");
});
