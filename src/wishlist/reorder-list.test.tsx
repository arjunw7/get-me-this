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
import type { WishlistItemView } from "./display";
import { WishlistItemsPanel } from "./reorder-list";

const first: WishlistItemView = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Ceramic matcha set",
  sourceUrl: null,
  retailer: null,
  imageSrc: null,
  note: null,
  desireLevel: "really_want",
  sortPosition: 1,
  originalAmountMinor: null,
  originalCurrency: null,
  converted: null,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
const second: WishlistItemView = {
  ...first,
  id: "00000000-0000-4000-8000-000000000002",
  title: "Tiny gold hoops",
  imageSrc: "/assets/landing/k-kettle.jpg",
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
        "Drag items into place. Top of the list is what friends see first.",
      ),
    ).toBeVisible();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(
      document.querySelector('img[src="/assets/landing/k-kettle.jpg"]'),
    ).not.toBeNull();
  });

  it("uses one named handle per item without visible arrow controls", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Reorder" }));
    expect(
      screen.getByRole("button", {
        name: "Drag to reorder Ceramic matcha set",
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Drag to reorder Tiny gold hoops" }),
    ).toHaveAccessibleDescription(/Space or Enter to pick up/);
    expect(
      screen.queryByRole("button", { name: /^Move .* (up|down)$/ }),
    ).toBeNull();
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
    screen
      .getByRole("button", { name: "Drag to reorder Tiny gold hoops" })
      .focus();
    await user.keyboard(" {ArrowUp} ");

    expect(move).toHaveBeenCalledWith({
      expectedIds: [first.id, second.id],
      movedItemId: second.id,
      targetIndex: 0,
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saving order…");
    expect(
      screen.getByRole("button", { name: "Drag to reorder Tiny gold hoops" }),
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
    expect(screen.getByRole("button", { name: "Reorder" })).toHaveFocus();
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

    fireEvent.pointerDown(handle, { pointerId: 7, button: 0, isPrimary: true });
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(document, { pointerId: 7 });

    await waitFor(() =>
      expect(move).toHaveBeenCalledWith({
        expectedIds: [first.id, second.id],
        movedItemId: first.id,
        targetIndex: 1,
      }),
    );
  });

  it("previews keyboard movement without writing until drop, and Escape cancels", async () => {
    const user = userEvent.setup();
    const { move } = setup();
    await user.click(screen.getByRole("button", { name: "Reorder" }));
    const handle = screen.getByRole("button", {
      name: "Drag to reorder Ceramic matcha set",
    });
    handle.focus();
    await user.keyboard("{Enter}{ArrowUp}");
    expect(handle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveClass("sr-only");
    expect(
      within(screen.getAllByRole("listitem")[0]).getByText(first.title),
    ).toBeVisible();
    await user.keyboard("{ArrowDown}");
    expect(
      within(screen.getAllByRole("listitem")[1]).getByText(first.title),
    ).toBeVisible();
    expect(handle).toHaveFocus();
    expect(move).not.toHaveBeenCalled();
    await user.tab();
    expect(handle).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(handle).toHaveAttribute("aria-pressed", "false");
    expect(handle).toHaveFocus();
    expect(
      within(screen.getAllByRole("listitem")[0]).getByText(first.title),
    ).toBeVisible();
    expect(move).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Move cancelled");
  });

  it("drops keyboard previews with Enter and submits the confirmed sequence", async () => {
    const user = userEvent.setup();
    const move = vi
      .fn()
      .mockResolvedValue({ status: "saved", items: [second, first] });
    setup(move);
    await user.click(screen.getByRole("button", { name: "Reorder" }));
    screen
      .getByRole("button", { name: "Drag to reorder Ceramic matcha set" })
      .focus();
    await user.keyboard("{Enter}{End}{Enter}");
    expect(move).toHaveBeenCalledExactlyOnceWith({
      expectedIds: [first.id, second.id],
      movedItemId: first.id,
      targetIndex: 1,
    });
    expect(screen.getByRole("status")).toHaveTextContent("Order saved");
    expect(
      screen.getByRole("button", {
        name: "Drag to reorder Ceramic matcha set",
      }),
    ).toHaveFocus();
  });

  it("cancels a pointer preview without persisting", async () => {
    const user = userEvent.setup();
    const { move } = setup();
    await user.click(screen.getByRole("button", { name: "Reorder" }));
    const handle = screen.getByRole("button", {
      name: "Drag to reorder Ceramic matcha set",
    });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi
        .fn()
        .mockReturnValue(
          screen.getByText(second.title).closest("[data-reorder-id]"),
        ),
    });
    fireEvent.pointerDown(handle, {
      pointerId: 8,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
    });
    fireEvent.pointerMove(handle, { pointerId: 8, clientX: 100, clientY: 100 });
    expect(
      within(screen.getAllByRole("listitem")[1]).getByText(first.title),
    ).toBeVisible();
    fireEvent.pointerCancel(document, { pointerId: 8 });
    expect(
      within(screen.getAllByRole("listitem")[0]).getByText(first.title),
    ).toBeVisible();
    expect(move).not.toHaveBeenCalled();
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
    screen
      .getByRole("button", { name: "Drag to reorder Tiny gold hoops" })
      .focus();
    await user.keyboard(" {ArrowUp} ");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn’t confirm the saved order.",
    );
    expect(screen.getByRole("button", { name: "Retry refresh" })).toHaveFocus();
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
    screen
      .getByRole("button", { name: "Drag to reorder Tiny gold hoops" })
      .focus();
    await user.keyboard(" {ArrowUp} ");

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
