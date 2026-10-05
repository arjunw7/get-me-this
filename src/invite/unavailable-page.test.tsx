// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("./invite-actions", () => ({ discardProvenFlowsAction: vi.fn() }));
import InviteUnavailablePage from "@/app/invite/unavailable/page";
it("offers only the recovery link without a discard action", () => {
  render(<InviteUnavailablePage />);
  expect(
    screen.getByRole("link", { name: "Back to Get Me This" }),
  ).toHaveAttribute("href", "/");
  expect(
    screen.queryByRole("button", { name: /Discard/ }),
  ).not.toBeInTheDocument();
});
