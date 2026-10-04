// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { WishlistExample } from "./wishlist-example";

describe("standalone wishlist demonstration", () => {
  it("shows the same two gifts to a friend after one share action", async () => {
    const user = userEvent.setup();
    render(<WishlistExample />);
    const example = screen.getByRole("region", { name: "Example wishlist" });
    expect(within(example).getAllByRole("listitem")).toHaveLength(2);
    expect(within(example).getByText("Your view")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Share this example" }),
    );
    expect(within(example).getByText("Friend’s view")).toBeVisible();
    expect(within(example).getByText("Matcha set")).toBeVisible();
    expect(within(example).getByText("Film camera")).toBeVisible();
    expect(
      within(example).getByText("They can browse. No sign-up needed."),
    ).toHaveAttribute("aria-live", "polite");
    expect(example).not.toHaveTextContent(/reservation|reserved|group/i);
    expect(within(example).queryByRole("link")).not.toBeInTheDocument();
  });
  it("keeps focus on the single action and supports replay without navigation", async () => {
    const user = userEvent.setup();
    render(<WishlistExample />);
    const action = screen.getByRole("button", { name: "Share this example" });
    action.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Try again" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("button", { name: "Share this example" }),
    ).toHaveFocus();
    expect(screen.getByText("Your view")).toBeVisible();
  });
});
