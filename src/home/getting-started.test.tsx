// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GettingStarted } from "./getting-started";
import { HomeLinkForm } from "./home-link-form";
import { getStarterIdea } from "./starter-ideas";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("first-use Home", () => {
  it("offers allowlisted ideas as editable handoffs without saving products", () => {
    render(
      <GettingStarted wishlist={{ wishlistId: "owner-list", items: [] }} />,
    );
    expect(
      screen.getByRole("region", { name: "Add something you’d love to get" }),
    ).toHaveAttribute("aria-current", "step");
    const ideas = screen.getByRole("list", {
      name: "No link handy? Start with an idea",
    });
    for (const link of within(ideas).getAllByRole("link")) {
      const destination = new URL(
        link.getAttribute("href")!,
        "https://getmethis.test",
      );
      expect(destination.pathname).toBe("/wishlist/items/new");
      expect(
        getStarterIdea(destination.searchParams.get("pick")),
      ).not.toBeNull();
    }
    expect(getStarterIdea("https://attacker.test")).toBeNull();
    expect(getStarterIdea(["desk"])).toBeNull();
    expect(
      screen.getByRole("link", { name: "Create a group" }),
    ).toHaveAttribute("href", "/groups");
  });
  it("uses real saved items to complete step one and keeps their titles accessible on image failure", () => {
    render(
      <GettingStarted
        wishlist={{
          wishlistId: "owner-list",
          items: [
            {
              id: "item-one",
              title: "My camping mug",
              sourceUrl: null,
              retailer: null,
              imageSrc: "https://example.test/mug.jpg",
              note: null,
              desireLevel: "would_love",
              sortPosition: 1,
              originalAmountMinor: null,
              originalCurrency: null,
              converted: null,
              createdAt: "2026-01-01",
              updatedAt: "2026-01-01",
            },
          ],
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "1 item on your wishlist" }),
    ).toBeVisible();
    const items = screen.getByRole("list", { name: "Your items" });
    const image = items.querySelector("img");
    expect(image).not.toBeNull();
    fireEvent.error(image!);
    expect(within(items).getAllByText("My camping mug").length).toBeGreaterThan(
      0,
    );
    expect(
      within(items).getByText("My camping mug", { selector: ".sr-only" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "No link handy? Start with an idea" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Share your wishlist" }),
    ).toHaveAttribute("aria-current", "step");
    expect(
      screen.getByRole("region", {
        name: "Create a group for your next occasion",
      }),
    ).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Add another" })).toHaveAttribute(
      "href",
      "/wishlist/items/new",
    );
  });
  it("reports clipboard denial without inventing a product link", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "readText").mockRejectedValue(
      new Error("denied"),
    );
    render(<HomeLinkForm />);
    await user.click(screen.getByRole("button", { name: "Paste" }));
    const input = screen.getByRole("textbox", {
      name: "Paste a product link from any shop",
    });
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Paste your link into the field",
    );
  });
});

const shareProps = {
  wishlist: { wishlistId: "sharing-list", items: [] },
  shareState: { enabled: true, version: "1", shareToken: "S".repeat(43) },
  onShareChange: vi.fn(),
};
it("uses the existing share modal and completes only a successful sharing action, retaining progress on reload", async () => {
  const user = userEvent.setup();
  const view = render(<GettingStarted {...shareProps} />);
  const shareStep = screen.getByRole("region", { name: "Share your wishlist" });
  await user.click(screen.getByRole("button", { name: "Share wishlist" }));
  expect(
    screen.getByRole("dialog", { name: "Share your wishlist" }),
  ).toBeVisible();
  expect(
    within(shareStep).queryByText("Wishlist shared."),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Copy link" }));
  expect(await within(shareStep).findByText("Wishlist shared.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Close sharing" }));
  view.unmount();
  render(<GettingStarted {...shareProps} />);
  expect(screen.getByText("Wishlist shared.")).toBeVisible();
  expect(localStorage.getItem("gmt:onboarding:shared:sharing-list")).toBe(
    "done",
  );
  expect(Object.values(localStorage).join("")).not.toContain(
    shareProps.shareState.shareToken,
  );
});
it("keeps sharing incomplete when copying is denied", async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
    new Error("denied"),
  );
  render(<GettingStarted {...shareProps} />);
  await user.click(screen.getByRole("button", { name: "Share wishlist" }));
  await user.click(screen.getByRole("button", { name: "Copy link" }));
  expect(
    await screen.findByText(
      "Copy didn’t work. Select and copy the link above.",
    ),
  ).toBeVisible();
  expect(screen.queryByText("Wishlist shared.")).not.toBeInTheDocument();
  expect(localStorage.getItem("gmt:onboarding:shared:sharing-list")).toBeNull();
});

it("marks the WhatsApp handoff complete without claiming message delivery", async () => {
  const user = userEvent.setup();
  render(<GettingStarted {...shareProps} />);
  await user.click(screen.getByRole("button", { name: "Share wishlist" }));
  await user.click(screen.getByRole("link", { name: "Share on WhatsApp" }));
  expect(screen.getByText("Wishlist shared.")).toBeVisible();
});
it("still completes this visit when browser storage is unavailable", async () => {
  const user = userEvent.setup();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("unavailable");
  });
  render(<GettingStarted {...shareProps} />);
  await user.click(screen.getByRole("button", { name: "Share wishlist" }));
  await user.click(screen.getByRole("button", { name: "Copy link" }));
  expect(await screen.findByText("Wishlist shared.")).toBeVisible();
});
