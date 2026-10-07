// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
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
  it("hides the copy action without marking the source on a fresh copied visit", () => {
    render(
      <CopyToWishlistButton
        groupId={groupId}
        itemId={itemId}
        initiallyCopied
      />,
    );
    expect(screen.queryByTestId("copy-cat")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the idle copy action with the hidden inputs", async () => {
    copyAction.mockResolvedValue({ status: "idle" });

    render(<CopyToWishlistButton groupId={groupId} itemId={itemId} />);

    const button = screen.getByRole("button", {
      name: "Copy to my wishlist",
    });
    expect(button).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("announces success without putting the sticker on the source", async () => {
    copyAction.mockResolvedValue({ status: "success" });

    render(<CopyToWishlistButton groupId={groupId} itemId={itemId} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Copy to my wishlist" }),
    );

    await screen.findByText("Copied to your wishlist");
    expect(screen.queryByTestId("copy-cat")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveClass("sr-only");
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

    await screen.findByText("Copied to your wishlist");
    expect(screen.queryByTestId("copy-cat")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Copied to your wishlist",
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
        name: "Copy to my wishlist",
      }),
    ).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't copy — try again",
    );
  });

  it("blocks repeat copies while the first request is pending", async () => {
    let finish!: (state: { status: "success" }) => void;
    copyAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<CopyToWishlistButton groupId={groupId} itemId={itemId} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Copy to my wishlist" }),
    );
    const pending = screen.getByRole("button", { name: "Copying…" });
    expect(pending).toBeDisabled();
    expect(pending.querySelector("svg.animate-spin")).toBeInTheDocument();
    const calls = copyAction.mock.calls.length;
    await userEvent.click(pending);
    expect(copyAction).toHaveBeenCalledTimes(calls);
    await act(async () => finish({ status: "success" }));
    expect(screen.queryByTestId("copy-cat")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
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
