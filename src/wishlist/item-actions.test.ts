import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ gate: vi.fn(), save: vi.fn(), load: vi.fn(), remove: vi.fn(), reconcile: vi.fn(), revalidate: vi.fn(), redirect: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/src/profile/session", () => ({ requireCompleteProfile: mocks.gate }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./item-write", () => ({ saveReviewedItem: mocks.save, loadOwnItemForEdit: mocks.load, deleteOwnItem: mocks.remove, reconcileOwnItem: mocks.reconcile }));

import { createItemAction, deleteItemAction, editItemAction, reconcileDeleteAction } from "./item-actions";

const userId = "00000000-0000-4000-8000-000000000001";
const itemId = "00000000-0000-4000-8000-000000000002";
const opaqueItem = { id: itemId, wishlist_id: "00000000-0000-4000-8000-000000000003", owner_id: userId, title: "Lamp", source_url: null, retailer: null, note: null, desire_level: "would_love", original_amount_minor: "9007199254740993", original_currency: "ZZZ", converted_amount_minor: null, converted_currency: null, conversion_rate_source: null, conversion_rate_at: null, updated_at: "2026-09-30T00:00:00Z" };

function formData(fields: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ title: "Lamp", sourceUrl: "", retailer: "", amount: "", currency: "INR", note: "", desireLevel: "would_love", submissionId: "00000000-0000-4000-8000-000000000004", ...fields })) data.set(key, value);
  return data;
}

beforeEach(() => { vi.clearAllMocks(); mocks.gate.mockResolvedValue({ userId, email: null, profile: { displayName: "Ada", tasteLine: null } }); });

describe("wishlist item actions", () => {
  it("runs the fresh profile gate before create persistence and ignores forged metadata", async () => {
    const redirectSignal = new Error("NEXT_REDIRECT:/onboarding");
    mocks.gate.mockRejectedValueOnce(redirectSignal);
    await expect(createItemAction({ status: "idle" }, formData({ owner_id: "foreign", image_url: "https://attacker.invalid/", sort_position: "-1" }))).rejects.toBe(redirectSignal);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("sends only validated manual fields and the exact price pair to persistence", async () => {
    mocks.save.mockResolvedValueOnce({ kind: "saved", itemId, replayed: false });
    await createItemAction({ status: "idle" }, formData({ owner_id: "foreign", wishlist_id: "foreign", image_url: "https://attacker.invalid/", converted_amount_minor: "9", sort_position: "-1", extraction_status: "extracted" }));
    expect(mocks.save.mock.calls[0][0]).toBe(userId);
    expect(mocks.save.mock.calls[0][1]).toEqual({ kind: "create", submissionId: "00000000-0000-4000-8000-000000000004" });
    expect(mocks.save.mock.calls[0][2]).toEqual({ title: "Lamp", source_url: null, retailer: null, note: null, desire_level: "would_love", original_amount_minor: null, original_currency: null });
    expect(mocks.revalidate).toHaveBeenCalledWith("/wishlist");
    expect(mocks.redirect).toHaveBeenCalledWith("/wishlist?item=added");
  });

  it("gates every action before item reads or writes", async () => {
    mocks.gate.mockRejectedValueOnce(new Error("gate"));
    await expect(editItemAction(itemId, { status: "idle" }, formData({ priceIntent: "preserve" }))).rejects.toThrow("gate");
    mocks.gate.mockRejectedValueOnce(new Error("gate"));
    await expect(deleteItemAction(itemId, { status: "idle" }, formData())).rejects.toThrow("gate");
    mocks.gate.mockRejectedValueOnce(new Error("gate"));
    await expect(reconcileDeleteAction(itemId, { status: "idle" }, formData())).rejects.toThrow("gate");
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("derives opaque-price preservation from the owner row, not posted amount or currency", async () => {
    mocks.load.mockResolvedValueOnce(opaqueItem);
    mocks.save.mockResolvedValueOnce({ kind: "saved", itemId, replayed: false });
    await editItemAction(itemId, { status: "idle" }, formData({ priceIntent: "preserve", amount: "999", currency: "ZZZ" }));
    expect(mocks.save.mock.calls[0][0]).toBe(userId);
    expect(mocks.save.mock.calls[0][1]).toEqual({ kind: "edit", itemId });
    expect(mocks.save.mock.calls[0][2].price).toEqual({ kind: "preserve", expected: { original_amount_minor: "9007199254740993", original_currency: "ZZZ" } });
  });

  it("returns an invalid intent and the complete raw draft without a write", async () => {
    mocks.load.mockResolvedValueOnce(opaqueItem);
    const result = await editItemAction(itemId, { status: "idle" }, formData({ priceIntent: "tampered", amount: "999", sourceUrl: "https://bad.invalid/" }));
    expect(result).toMatchObject({ status: "invalid", errors: { priceIntent: "invalid" }, draft: { amount: "999", sourceUrl: "https://bad.invalid/", priceIntent: "tampered" } });
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
