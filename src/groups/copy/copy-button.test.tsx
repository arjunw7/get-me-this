// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CopyToWishlistButton } from "./copy-button";

const copyAction = vi.fn();

vi.mock("./copy-actions", () => ({
  copyToMyWishlistAction: (...args: unknown[]) => copyAction(...args),
}));

const groupId = "00000000-0000-4000-8000-0000000000a1";
const itemId = "00000000-0000-4000-8000-0000000000b1";

describe("CopyToWishlistButton", () => {
  it("renders the idle copy action with the hidden inputs", async () => {
    copyAction.mockResolvedValue({ status: "idle" });

    render(<CopyToWishlistButton groupId={groupId} itemId={itemId} />);

    const button = screen.getByRole("button", {
      name: "Copy to my wishlist",
    });
    expect(button).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("shows the designed success confirmation after a copy", async () => {
    copyAction.mockResolvedValue({ status: "success" });

    render(<CopyToWishlistButton groupId={groupId} itemId={itemId} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Copy to my wishlist" }),
    );

    const button = await screen.findByRole("button", {
      name: "Copied to your wishlist",
    });
    expect(button).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Copied to your wishlist",
    );
  });

  it("reports the already-copied state without pretending a fresh success", async () => {
    copyAction.mockResolvedValue({ status: "already" });

    render(<CopyToWishlistButton groupId={groupId} itemId={itemId} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Copy to my wishlist" }),
    );

    expect(
      await screen.findByRole("button", {
        name: "Already in your wishlist",
      }),
    ).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Already in your wishlist",
    );
  });

  it("shows the generic failure with the action restored for a retry", async () => {
    copyAction.mockResolvedValue({ status: "failure" });

    render(<CopyToWishlistButton groupId={groupId} itemId={itemId} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Copy to my wishlist" }),
    );

    expect(
      await screen.findByRole("button", {
        name: "Couldn't copy — try again",
      }),
    ).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Couldn't copy — try again",
    );
  });

  it("sends the group and item ids to the server action", async () => {
    copyAction.mockResolvedValue({ status: "idle" });

    render(<CopyToWishlistButton groupId={groupId} itemId={itemId} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Copy to my wishlist" }),
    );

    const formData = copyAction.mock.calls[0][1] as FormData;
    expect(formData.get("groupId")).toBe(groupId);
    expect(formData.get("itemId")).toBe(itemId);
  });
});
