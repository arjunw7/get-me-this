// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import type { ReorderActionResult } from "./reorder-actions";
import type { WishlistItemSnapshot } from "./display";
import { WishlistItemsPanel } from "./reorder-list";

const first: WishlistItemSnapshot = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Ceramic matcha set",
  sourceUrl: null,
  retailer: null,
  imageUrl: null,
  imageSnapshotPath: null,
  note: null,
  desireLevel: "really_want",
  sortPosition: 1,
  originalAmountMinor: null,
  originalCurrency: null,
  converted: null,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
const second: WishlistItemSnapshot = {
  ...first,
  id: "00000000-0000-4000-8000-000000000002",
  title: "Tiny gold hoops",
  imageUrl: "/assets/landing/k-kettle.jpg",
  desireLevel: "would_love",
  sortPosition: 2,
};
const ordered = [first, second] as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup(
  move = vi.fn<
    (input: {
      expectedIds: readonly string[];
      movedItemId: string;
      targetIndex: number;
    }) => Promise<ReorderActionResult>
  >(),
  refresh = vi.fn<() => Promise<ReorderActionResult>>(),
  remove = vi.fn(),
) {
  render(
    <WishlistItemsPanel
      items={ordered}
      reorderAction={move}
      refreshAction={refresh}
      deleteAction={remove}
    />,
  );
  return { move, refresh, remove };
}

describe("WishlistItemsPanel", () => {
  it("switches between the normal card grid and the pressed reorder view", async () => {
    const user = userEvent.setup();
    setup();

    expect(screen.getByRole("button", { name: "Reorder" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Reorder" }));
    const done = screen.getByRole("button", { name: "Done" });
    expect(done).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText(
        "Drag or use the arrows. Top of the list is what friends see first.",
      ),
    ).toBeVisible();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(
      document.querySelector('img[src="/assets/landing/k-kettle.jpg"]'),
    ).not.toBeNull();
  });

  it("names every move and drag control and disables only boundaries", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Reorder" }));

    expect(
      screen.getByRole("button", {
        name: "Drag to reorder Ceramic matcha set",
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Move Ceramic matcha set up" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move Ceramic matcha set down" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Move Tiny gold hoops up" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Move Tiny gold hoops down" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Remove Tiny gold hoops" }),
    ).toBeEnabled();
  });

  it("sends one exact move, blocks another, and lets Done wait for its fresh read", async () => {
    const user = userEvent.setup();
    const pending = deferred<ReorderActionResult>();
    const move = vi.fn().mockReturnValue(pending.promise);
    setup(move);
    await user.click(screen.getByRole("button", { name: "Reorder" }));
    await user.click(
      screen.getByRole("button", { name: "Move Tiny gold hoops up" }),
    );

    expect(move).toHaveBeenCalledWith({
      expectedIds: [first.id, second.id],
      movedItemId: second.id,
      targetIndex: 0,
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saving order…");
    expect(
      screen.getByRole("button", { name: "Move Tiny gold hoops down" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Finishing…" })).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    await act(async () => {
      pending.resolve({ status: "saved", items: [second, first] });
      await pending.promise;
    });
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("Order saved.");
  });

  it("commits the dragged item ID after the preview has reordered the array", async () => {
    const user = userEvent.setup();
    const move = vi.fn().mockResolvedValue({
      status: "saved",
      items: [second, first],
    });
    setup(move);
    await user.click(screen.getByRole("button", { name: "Reorder" }));
    const handle = screen.getByRole("button", {
      name: "Drag to reorder Ceramic matcha set",
    });
    const targetRow = screen
      .getByText("Tiny gold hoops")
      .closest("[data-reorder-id]");
    expect(targetRow).not.toBeNull();
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn().mockReturnValue(targetRow),
    });

    fireEvent.pointerDown(handle, { pointerId: 7 });
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 1, clientY: 1 });
    fireEvent.pointerUp(handle, { pointerId: 7 });

    await waitFor(() =>
      expect(move).toHaveBeenCalledWith({
        expectedIds: [first.id, second.id],
        movedItemId: first.id,
        targetIndex: 1,
      }),
    );
  });

  it("restores the confirmed order and keeps Done open until recovery succeeds", async () => {
    const user = userEvent.setup();
    const move = vi.fn().mockResolvedValue({ status: "recovery" });
    const refresh = vi.fn().mockResolvedValue({
      status: "refreshed",
      items: ordered,
    });
    setup(move, refresh);
    await user.click(screen.getByRole("button", { name: "Reorder" }));
    await user.click(
      screen.getByRole("button", { name: "Move Tiny gold hoops up" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn’t confirm the saved order.",
    );
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText(first.title)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Retry refresh" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("turns a lost action response into recovery instead of replaying the move", async () => {
    const user = userEvent.setup();
    const move = vi.fn().mockRejectedValue(new Error("connection lost"));
    setup(move);
    await user.click(screen.getByRole("button", { name: "Reorder" }));
    await user.click(
      screen.getByRole("button", { name: "Move Tiny gold hoops up" }),
    );

    expect(move).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t confirm the saved order.",
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("uses confirmed hard deletion and refetches the reorder list after success", async () => {
    const user = userEvent.setup();
    const refresh = vi.fn().mockResolvedValue({
      status: "refreshed",
      items: [first],
    });
    const remove = vi.fn().mockResolvedValue({ status: "deleted" });
    setup(vi.fn(), refresh, remove);
    await user.click(screen.getByRole("button", { name: "Reorder" }));

    await user.click(
      screen.getByRole("button", { name: "Remove Tiny gold hoops" }),
    );
    expect(
      screen.getByRole("heading", { name: "Delete this item?" }),
    ).toBeVisible();
    expect(screen.getByText(/This can’t be undone/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    await user.click(
      screen.getByRole("button", { name: "Remove Tiny gold hoops" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete item" }));
    expect(remove).toHaveBeenCalled();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.queryAllByRole("listitem")).toHaveLength(0);
      expect(screen.queryByRole("button", { name: "Reorder" })).toBeNull();
      expect(screen.getAllByRole("article")).toHaveLength(1);
    });
    expect(screen.queryByText(second.title)).toBeNull();
  });

  it("returns to the designed empty state when deletion removes the last item", async () => {
    const user = userEvent.setup();
    const refresh = vi.fn().mockResolvedValue({
      status: "refreshed",
      items: [],
    });
    const remove = vi.fn().mockResolvedValue({ status: "deleted" });
    setup(vi.fn(), refresh, remove);
    await user.click(screen.getByRole("button", { name: "Reorder" }));
    await user.click(
      screen.getByRole("button", { name: "Remove Tiny gold hoops" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete item" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole("region", { name: "Your wishlist is empty" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reorder" })).toBeNull();
  });

  it("refetches the authoritative list after an uncertain delete without removing the row speculatively", async () => {
    const user = userEvent.setup();
    const refresh = vi.fn().mockResolvedValue({
      status: "refreshed",
      items: ordered,
    });
    const remove = vi.fn().mockResolvedValue({ status: "uncertain" });
    setup(vi.fn(), refresh, remove);
    await user.click(screen.getByRole("button", { name: "Reorder" }));
    await user.click(
      screen.getByRole("button", { name: "Remove Tiny gold hoops" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete item" }));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn’t confirm whether the item was removed.",
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("does not expose an impossible reorder mode for one item", () => {
    render(
      <WishlistItemsPanel
        items={[first]}
        reorderAction={vi.fn()}
        refreshAction={vi.fn()}
        deleteAction={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Reorder" })).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });
});
