// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  remove: vi.fn(),
  reconcile: vi.fn(),
  push: vi.fn(),
}));
vi.mock("./item-actions", () => ({
  deleteItemAction: (id: string, state: unknown, data: FormData) =>
    actions.remove(id, state, data),
  reconcileDeleteAction: (id: string, state: unknown, data: FormData) =>
    actions.reconcile(id, state, data),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: actions.push }),
  unstable_rethrow: (error: unknown) => {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof error.digest === "string" &&
      error.digest.startsWith("NEXT_REDIRECT;")
    )
      throw error;
  },
}));

import { DeleteDialog } from "./delete-dialog";
import { DeleteErrorBoundary } from "./delete-error-boundary";

const itemId = "00000000-0000-4000-8000-000000000002";
beforeEach(() => {
  actions.remove.mockReset().mockResolvedValue({ status: "idle" });
  actions.reconcile.mockReset().mockResolvedValue({ status: "idle" });
  actions.push.mockReset();
});

describe("DeleteDialog", () => {
  it("moves focus into the confirmation, and Cancel or Escape closes without calling an action", async () => {
    const user = userEvent.setup();
    render(<DeleteDialog itemId={itemId} title="Lamp" />);
    const opener = screen.getByRole("button", { name: "Delete item" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(opener).toHaveFocus();
    expect(actions.remove).not.toHaveBeenCalled();
    await user.click(opener);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(actions.remove).not.toHaveBeenCalled();
  });

  it("checks an uncertain delete, permits retry only when still present, then navigates on confirmed removal", async () => {
    actions.remove
      .mockResolvedValueOnce({ status: "uncertain" })
      .mockResolvedValueOnce({ status: "deleted" });
    actions.reconcile.mockResolvedValueOnce({ status: "present" });
    const user = userEvent.setup();
    render(<DeleteDialog itemId={itemId} title="Lamp" />);
    await user.click(screen.getByRole("button", { name: "Delete item" }));
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete item" }),
    );
    await user.click(
      await within(dialog).findByRole("button", { name: "Check status" }),
    );
    await within(dialog).findByText(
      "The item is still in your wishlist. You can try deleting again.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Retry delete" }),
    );
    await waitFor(() =>
      expect(actions.push).toHaveBeenCalledWith("/wishlist?item=deleted"),
    );
  });

  it("routes an absent reconciliation to a fresh owner-scoped item page without claiming delete success", async () => {
    actions.remove.mockResolvedValueOnce({ status: "uncertain" });
    actions.reconcile.mockResolvedValueOnce({ status: "absent" });
    const user = userEvent.setup();
    render(<DeleteDialog itemId={itemId} title="Lamp" />);
    await user.click(screen.getByRole("button", { name: "Delete item" }));
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete item" }),
    );
    await user.click(
      await within(dialog).findByRole("button", { name: "Check status" }),
    );
    expect(
      await within(dialog).findByRole("link", { name: "Check the item" }),
    ).toHaveAttribute("href", `/wishlist/items/${itemId}/edit`);
    expect(
      within(dialog).queryByText("Item removed from your wishlist."),
    ).not.toBeInTheDocument();
  });

  it("hides the item title after an unavailable delete result", async () => {
    actions.remove.mockResolvedValueOnce({ status: "unavailable" });
    const user = userEvent.setup();
    render(<DeleteDialog itemId={itemId} title="Private fixture title" />);
    await user.click(screen.getByRole("button", { name: "Delete item" }));
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete item" }),
    );
    expect(
      await within(dialog).findByRole("heading", {
        name: "This item isn’t available.",
      }),
    ).toBeVisible();
    expect(
      within(dialog).queryByText(/Private fixture title/),
    ).not.toBeInTheDocument();
  });
});

describe("DeleteErrorBoundary", () => {
  it("provides a fresh item-page link after a browser action exception", () => {
    const Explodes = () => {
      throw new Error("provider body not safe to display");
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <DeleteErrorBoundary itemId={itemId}>
        <Explodes />
      </DeleteErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn’t confirm the delete request.",
    );
    expect(
      screen.getByRole("link", { name: "Check item status" }),
    ).toHaveAttribute("href", `/wishlist/items/${itemId}/edit`);
    expect(
      screen.queryByText("provider body not safe to display"),
    ).not.toBeInTheDocument();
  });

  it("rethrows Next redirect signals instead of converting them to a transport fallback", () => {
    const signal = Object.assign(new Error("redirect"), {
      digest: "NEXT_REDIRECT;push;/wishlist;307;",
    });
    expect(() => DeleteErrorBoundary.getDerivedStateFromError(signal)).toThrow(
      signal,
    );
  });
});
