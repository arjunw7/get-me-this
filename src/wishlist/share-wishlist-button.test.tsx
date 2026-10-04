// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ShareWishlistButton } from "./share-wishlist-button";
import type { OwnShareState } from "./public-share-types";

const state: OwnShareState = {
  enabled: true,
  version: "1",
  shareToken: "public-token",
};

describe("ShareWishlistButton", () => {
  it("explains public access and confirms copying only after clipboard success", async () => {
    const user = userEvent.setup();
    const write = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();
    const { container } = render(
      <div style={{ overflow: "hidden" }}>
        <ShareWishlistButton state={state} onChange={vi.fn()} />
      </div>,
    );
    await user.click(screen.getByRole("button", { name: "Share wishlist" }));
    expect(
      screen.getByRole("dialog", { name: "Share your wishlist" }),
    ).toBeVisible();
    expect(container).not.toContainElement(screen.getByRole("dialog"));
    expect(document.body).toContainElement(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog").parentElement).toHaveClass(
      "ph-no-capture",
    );
    expect(screen.getByText(/Anyone with your link/)).toBeVisible();
    const link = `${window.location.origin}/s/public-token`;
    expect(
      screen.getByRole("textbox", { name: "Public wishlist link" }),
    ).toHaveValue(link);
    expect(
      screen.getByRole("link", { name: /Open public wishlist/ }),
    ).toHaveAttribute("href", link);
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(write).toHaveBeenCalledWith(link);
    expect(screen.getByRole("status")).toHaveTextContent("Link copied.");
  });

  it("offers WhatsApp with the same active link and safe external navigation", async () => {
    const user = userEvent.setup();
    render(<ShareWishlistButton state={state} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Share wishlist" }));
    const link = screen.getByRole("link", { name: "Share on WhatsApp" });
    expect(new URL(link.getAttribute("href")!).searchParams.get("text")).toBe(
      `Here's my wishlist on Get Me This: ${window.location.origin}/s/public-token`,
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("hides both share actions for a disabled wishlist", async () => {
    const user = userEvent.setup();
    render(
      <ShareWishlistButton
        state={{ enabled: false, version: "2", shareToken: null }}
        onChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Share wishlist" }));
    expect(
      screen.queryByRole("link", { name: "Share on WhatsApp" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
  });

  it("keeps a selectable read-only link when clipboard access fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("blocked"),
    );
    render(<ShareWishlistButton state={state} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Share wishlist" }));
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    const input = screen.getByRole("textbox", { name: "Public wishlist link" });
    expect(input).toHaveAttribute("readonly");
    expect(input).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Copy didn’t work");
    expect(screen.queryByText("Link copied.")).not.toBeInTheDocument();
  });

  it("only offers copying and an adjacent accessible open-link icon for an active wishlist", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<ShareWishlistButton state={state} onChange={change} />);
    await user.click(screen.getByRole("button", { name: "Share wishlist" }));
    const input = screen.getByRole("textbox", { name: "Public wishlist link" });
    const link = screen.getByRole("link", {
      name: "Open public wishlist (opens in a new tab)",
    });
    expect(link.parentElement).toBe(input.parentElement);
    expect(link).toHaveAttribute(
      "href",
      `${window.location.origin}/s/public-token`,
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByText("Open public wishlist")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Stop sharing" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Stop sharing your wishlist?"),
    ).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });

  it("can recover an already disabled link using the returned version and token", async () => {
    const user = userEvent.setup();
    const change = vi.fn().mockResolvedValue({
      status: "saved",
      state: { enabled: true, version: "3", shareToken: "new-token" },
    });
    render(
      <ShareWishlistButton
        state={{ enabled: false, version: "2", shareToken: null }}
        onChange={change}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Share wishlist" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Enable sharing" }));
    expect(change).toHaveBeenCalledWith("2", true);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Close sharing" }),
      ).toHaveFocus(),
    );
    expect(screen.getByRole("textbox")).toHaveValue(
      `${window.location.origin}/s/new-token`,
    );
    expect(
      screen.getByRole("link", { name: /Open public wishlist/ }),
    ).toHaveAttribute("href", `${window.location.origin}/s/new-token`);
  });

  it("keeps a failed enable action recoverable without claiming a link exists", async () => {
    const user = userEvent.setup();
    render(
      <ShareWishlistButton
        state={{ enabled: false, version: "2", shareToken: null }}
        onChange={vi.fn().mockResolvedValue({ status: "error" })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Share wishlist" }));
    await user.click(screen.getByRole("button", { name: "Enable sharing" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Sharing couldn’t be updated",
    );
    expect(
      screen.getByRole("button", { name: "Enable sharing" }),
    ).toBeEnabled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Open public wishlist/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps the latest confirmed version across stale and newer revalidation props", async () => {
    const user = userEvent.setup();
    const disabled: OwnShareState = {
      enabled: false,
      version: "1",
      shareToken: null,
    };
    const change = vi.fn().mockResolvedValue({
      status: "saved",
      state: { enabled: true, version: "2", shareToken: "new-token" },
    });
    const { rerender } = render(
      <ShareWishlistButton state={disabled} onChange={change} />,
    );
    await user.click(screen.getByRole("button", { name: "Share wishlist" }));
    await user.click(screen.getByRole("button", { name: "Enable sharing" }));
    await screen.findByRole("textbox");
    rerender(<ShareWishlistButton state={disabled} onChange={change} />);
    expect(screen.getByRole("textbox")).toHaveValue(
      `${window.location.origin}/s/new-token`,
    );
    rerender(
      <ShareWishlistButton
        state={{ enabled: true, version: "3", shareToken: "refreshed-token" }}
        onChange={change}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveValue(
      `${window.location.origin}/s/refreshed-token`,
    );
  });

  it("traps keyboard focus and returns it to Share on Escape", async () => {
    const user = userEvent.setup();
    render(<ShareWishlistButton state={state} onChange={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Share wishlist" });
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Close sharing" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(
      screen.getByRole("link", { name: "Share on WhatsApp" }),
    ).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close sharing" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });
});
