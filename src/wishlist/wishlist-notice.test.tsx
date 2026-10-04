// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { WishlistNotice } from "./wishlist-notice";

describe("WishlistNotice", () => {
  it.each([
    ["added", "Item added to your wishlist."],
    ["updated", "Item changes saved."],
    ["deleted", "Item removed from your wishlist."],
  ] as const)("dismisses the %s notification", async (notice, message) => {
    const user = userEvent.setup();
    render(<WishlistNotice notice={notice} />);
    expect(screen.getByRole("status")).toHaveTextContent(message);
    await user.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("can be dismissed using the keyboard", async () => {
    const user = userEvent.setup();
    render(<WishlistNotice notice="added" />);
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Dismiss notification" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
