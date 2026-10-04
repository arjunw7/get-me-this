// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { WishlistExample } from "./wishlist-example";

describe("standalone wishlist demonstration", () => {
  it("keeps example edits through wishlist and anonymous friend views", async () => {
    const user = userEvent.setup();
    render(<WishlistExample />);
    await user.click(screen.getByRole("button", { name: /Add an idea/ }));
    const title = screen.getByLabelText("Item name");
    await user.clear(title);
    await user.type(title, "Blue espresso cups");
    await user.click(screen.getByRole("button", { name: "Save example item" }));
    await user.click(
      screen.getByRole("button", { name: "Preview shared wishlist" }),
    );
    const demo = screen.getByRole("region", { name: "Try an example" });
    expect(within(demo).getByText("Blue espresso cups")).toBeVisible();
    expect(demo).not.toHaveTextContent(/reservation|reserved|group/i);
    expect(within(demo).queryByRole("link")).not.toBeInTheDocument();
  });
  it("prevents an empty example item and does not change saved data until saving", async () => {
    const user = userEvent.setup();
    render(<WishlistExample />);
    await user.click(screen.getByRole("button", { name: /Add an idea/ }));
    await user.clear(screen.getByLabelText("Item name"));
    await user.type(screen.getByLabelText("Item name"), "   ");
    expect(
      screen.getByRole("button", { name: "Save example item" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Your wishlist/ }));
    expect(screen.getByText("Glazed espresso cups")).toBeVisible();
  });
});
