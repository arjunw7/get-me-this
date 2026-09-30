// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ create: vi.fn(), edit: vi.fn() }));
vi.mock("./item-actions", () => ({
  createItemAction: (state: unknown, data: FormData) =>
    actions.create(state, data),
  editItemAction: (id: string, state: unknown, data: FormData) =>
    actions.edit(id, state, data),
  createDraftDefaults: (submissionId: string) => ({
    title: "",
    sourceUrl: "",
    retailer: "",
    amount: "",
    currency: "INR",
    note: "",
    desireLevel: "would_love",
    submissionId,
  }),
}));

import { ItemForm } from "./item-form";
import type { EditItem } from "./item-write";

const itemId = "00000000-0000-4000-8000-000000000002";
function fixture(pair: {
  original_amount_minor: string | null;
  original_currency: string | null;
}): EditItem {
  return {
    id: itemId,
    wishlist_id: "w",
    owner_id: "u",
    title: "Lamp",
    source_url: null,
    retailer: null,
    note: null,
    desire_level: "would_love",
    ...pair,
    converted_amount_minor: null,
    converted_currency: null,
    conversion_rate_source: null,
    conversion_rate_at: null,
    updated_at: "2026-09-30T00:00:00Z",
  };
}
beforeEach(() => {
  actions.create.mockReset().mockResolvedValue({ status: "idle" });
  actions.edit.mockReset().mockResolvedValue({ status: "idle" });
});

describe("ItemForm price intent", () => {
  it("submits clear when a supported amount is blanked and replace when an empty pair gets a price", async () => {
    const user = userEvent.setup();
    const supported = fixture({
      original_amount_minor: "2499",
      original_currency: "INR",
    });
    const supportedDraft = {
      title: "Lamp",
      sourceUrl: "",
      retailer: "",
      amount: "24.99",
      currency: "INR",
      note: "",
      desireLevel: "would_love",
      priceIntent: "replace",
    };
    const { unmount } = render(
      <ItemForm
        mode="edit"
        itemId={itemId}
        item={supported}
        initialDraft={supportedDraft}
      />,
    );
    await user.clear(screen.getByLabelText("Price"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(actions.edit).toHaveBeenCalledTimes(1));
    expect(
      (actions.edit.mock.calls[0] as [string, unknown, FormData])[2].get(
        "priceIntent",
      ),
    ).toBe("clear");
    unmount();

    render(
      <ItemForm
        mode="edit"
        itemId={itemId}
        item={fixture({ original_amount_minor: null, original_currency: null })}
        initialDraft={{ ...supportedDraft, amount: "", priceIntent: "clear" }}
      />,
    );
    await user.type(screen.getByLabelText("Price"), "24.99");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(actions.edit).toHaveBeenCalledTimes(2));
    expect(
      (actions.edit.mock.calls[1] as [string, unknown, FormData])[2].get(
        "priceIntent",
      ),
    ).toBe("replace");
    expect(
      (actions.edit.mock.calls[1] as [string, unknown, FormData])[2].get(
        "amount",
      ),
    ).toBe("24.99");
  });

  it("keeps opaque prices in preserve mode until the user explicitly clears or replaces", async () => {
    const user = userEvent.setup();
    const opaque = fixture({
      original_amount_minor: "9007199254740993",
      original_currency: "ZZZ",
    });
    render(
      <ItemForm
        mode="edit"
        itemId={itemId}
        item={opaque}
        initialDraft={{
          title: "Lamp",
          sourceUrl: "",
          retailer: "",
          amount: "",
          currency: "INR",
          note: "",
          desireLevel: "would_love",
          priceIntent: "preserve",
        }}
      />,
    );
    expect(screen.getByLabelText("Price")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Replace price" }));
    expect(screen.getByLabelText("Price")).toBeEnabled();
    await user.type(screen.getByLabelText("Price"), "2.50");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(actions.edit).toHaveBeenCalledTimes(1));
    const submitted = (
      actions.edit.mock.calls[0] as [string, unknown, FormData]
    )[2];
    expect(submitted.get("priceIntent")).toBe("replace");
    expect(submitted.get("amount")).toBe("2.50");
  });

  it("submits an explicit clear for an opaque stored price", async () => {
    const user = userEvent.setup();
    render(
      <ItemForm
        mode="edit"
        itemId={itemId}
        item={fixture({
          original_amount_minor: "9007199254740993",
          original_currency: "ZZZ",
        })}
        initialDraft={{
          title: "Lamp",
          sourceUrl: "",
          retailer: "",
          amount: "",
          currency: "INR",
          note: "",
          desireLevel: "would_love",
          priceIntent: "preserve",
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Clear price" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(actions.edit).toHaveBeenCalledTimes(1));
    const submitted = (
      actions.edit.mock.calls[0] as [string, unknown, FormData]
    )[2];
    expect(submitted.get("priceIntent")).toBe("clear");
    expect(submitted.get("amount")).toBe("");
  });

  it("retains a rejected replacement amount and intent", async () => {
    actions.edit.mockResolvedValueOnce({
      status: "invalid",
      errors: { amount: "Enter a valid amount." },
      draft: {
        title: "Lamp",
        sourceUrl: "",
        retailer: "",
        amount: "99999999999999999999",
        currency: "KWD",
        note: "remember",
        desireLevel: "really_want",
        priceIntent: "replace",
      },
    });
    const user = userEvent.setup();
    render(
      <ItemForm
        mode="edit"
        itemId={itemId}
        item={fixture({ original_amount_minor: null, original_currency: null })}
        initialDraft={{
          title: "Lamp",
          sourceUrl: "",
          retailer: "",
          amount: "",
          currency: "INR",
          note: "",
          desireLevel: "would_love",
          priceIntent: "clear",
        }}
      />,
    );
    await user.type(screen.getByLabelText("Price"), "99999999999999999999");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Enter a valid amount.")).toBeVisible();
    expect(screen.getByLabelText("Price")).toHaveValue("99999999999999999999");
    expect(screen.getByLabelText("Note (optional)")).toHaveValue("remember");
    expect(
      (actions.edit.mock.calls[0] as [string, unknown, FormData])[2].get(
        "priceIntent",
      ),
    ).toBe("replace");
  });
});
