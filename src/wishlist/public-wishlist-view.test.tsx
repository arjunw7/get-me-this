// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PublicWishlistView } from "./public-wishlist-view";
import type { PublicWishlistView as Snapshot } from "./public-share-types";

vi.mock("server-only", () => ({}));
const snapshot: Snapshot = {
  displayName: "Aanya",
  tasteLine: "Little luxuries",
  vibe: "electric",
  viewerIsOwner: false,
  items: [
    {
      itemId: "item",
      title: "A ceramic cup",
      sourceUrl: "https://example.com/cup",
      retailer: "Ceramics",
      imageUrl: null,
      note: "The blue one",
      desireLevel: "would_love",
      originalAmountMinor: "250000",
      originalCurrency: "INR",
      reaction: {
        itemId: "item",
        counts: { veryYou: 0, questionable: 0, wantItToo: 0 },
        viewerReaction: null,
      },
    },
  ],
};
const props = {
  token: "public-token",
  snapshot,
  signedIn: false,
  onReact: vi.fn(),
  signinHref: "/auth?intent=public-wishlist",
};

describe("PublicWishlistView", () => {
  it("keeps Copy Cat stickers out of public sharing", () => {
    render(<PublicWishlistView {...props} />);
    expect(screen.queryByTestId("copy-cat")).toBeNull();
    expect(
      screen.queryByRole("img", { name: "Copy Cat — copied item" }),
    ).toBeNull();
  });
  it("keeps an unsupported original currency visible without crashing the public page", () => {
    render(
      <PublicWishlistView
        {...props}
        snapshot={{
          ...snapshot,
          items: [{ ...snapshot.items[0], originalCurrency: "XXX" }],
        }}
      />,
    );
    expect(
      screen.getByText("250000 XXX — price display unavailable"),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "A ceramic cup" }),
    ).toBeVisible();
  });
  it("lets signed-out visitors read items, with sign-in required to react and no gifting controls", () => {
    render(<PublicWishlistView {...props} />);
    expect(screen.getAllByRole("heading", { name: "Aanya" })[0]).toBeVisible();
    expect(screen.getByText("Little luxuries")).toBeVisible();
    expect(screen.queryByText(/electric vibe/)).not.toBeInTheDocument();
    expect(screen.queryByText("No reactions yet")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "A ceramic cup" }),
    ).toBeVisible();
    expect(screen.getByText("The blue one")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Sign in to react" }),
    ).toHaveAttribute("href", props.signinHref);
    expect(
      screen.getByRole("link", {
        name: "Open on Ceramics ↗ for A ceramic cup (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "https://example.com/cup");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/reserv|assignment|group|checklist|copy to/i),
    ).not.toBeInTheDocument();
  });

  it("uses Open link when no retailer is saved, without inventing a website name", () => {
    render(
      <PublicWishlistView
        {...props}
        snapshot={{
          ...snapshot,
          items: [{ ...snapshot.items[0], retailer: "   " }],
        }}
      />,
    );
    const link = screen.getByRole("link", {
      name: "Open link ↗ for A ceramic cup (opens in a new tab)",
    });
    expect(link).toHaveAttribute("href", "https://example.com/cup");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("keeps an owner's public reactions read-only even when signed in", () => {
    render(
      <PublicWishlistView
        {...props}
        signedIn
        snapshot={{ ...snapshot, viewerIsOwner: true }}
      />,
    );
    expect(screen.queryByText("No reactions yet")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Very you" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Sign in to react" }),
    ).not.toBeInTheDocument();
  });

  it("applies authoritative add, switch and remove responses for a signed-in visitor", async () => {
    const user = userEvent.setup();
    const onReact = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "confirmed",
        summary: {
          itemId: "item",
          counts: { veryYou: 1, questionable: 0, wantItToo: 0 },
          viewerReaction: "very_you",
        },
      })
      .mockResolvedValueOnce({
        kind: "confirmed",
        summary: {
          itemId: "item",
          counts: { veryYou: 0, questionable: 0, wantItToo: 1 },
          viewerReaction: "want_it_too",
        },
      })
      .mockResolvedValueOnce({
        kind: "confirmed",
        summary: snapshot.items[0].reaction,
      });
    render(<PublicWishlistView {...props} signedIn onReact={onReact} />);
    await user.click(screen.getByRole("button", { name: "Very you" }));
    expect(onReact).toHaveBeenNthCalledWith(1, "item", "very_you");
    expect(screen.getByRole("button", { name: "Very you" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Want it too" }));
    expect(onReact).toHaveBeenNthCalledWith(2, "item", "want_it_too");
    expect(screen.getByRole("button", { name: "Very you" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await user.click(screen.getByRole("button", { name: "Want it too" }));
    expect(onReact).toHaveBeenNthCalledWith(3, "item", null);
    expect(
      screen.getByRole("button", { name: "Very you" }),
    ).toHaveAccessibleDescription("0 reactions");
  });

  it("preserves the confirmed reaction and shows recovery copy on failure", async () => {
    const user = userEvent.setup();
    render(
      <PublicWishlistView
        {...props}
        signedIn
        onReact={vi.fn().mockResolvedValue({ kind: "retry" })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Very you" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your reaction couldn’t be saved",
    );
    expect(screen.getByRole("button", { name: "Very you" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("does not apply a response for a different item", async () => {
    const user = userEvent.setup();
    render(
      <PublicWishlistView
        {...props}
        signedIn
        onReact={vi.fn().mockResolvedValue({
          kind: "confirmed",
          summary: { ...snapshot.items[0].reaction, itemId: "other" },
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Very you" }));
    expect(screen.getByRole("alert")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Very you" }),
    ).toHaveAccessibleDescription("0 reactions");
  });

  it("renders an honest empty state without owner edit or add controls", () => {
    render(
      <PublicWishlistView {...props} snapshot={{ ...snapshot, items: [] }} />,
    );
    expect(
      screen.getByRole("heading", { name: "No wishlist items yet." }),
    ).toBeVisible();
    expect(
      screen.queryByRole("list", { name: "Wishlist items" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Add|Edit/ }),
    ).not.toBeInTheDocument();
  });
});

it("keeps nonzero public reaction summaries visible and read-only for signed-out visitors", () => {
  render(
    <PublicWishlistView
      {...props}
      snapshot={{
        ...snapshot,
        items: [
          {
            ...snapshot.items[0],
            reaction: {
              ...snapshot.items[0].reaction,
              counts: { veryYou: 1, questionable: 0, wantItToo: 0 },
            },
          },
        ],
      }}
    />,
  );
  expect(screen.getByLabelText("Very you: 1 reaction")).toBeVisible();
  expect(screen.queryByText("1 reaction")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Very you" }),
  ).not.toBeInTheDocument();
});
