// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The 005f two-phase save action contract: phase 1 creates through the
 * UNMODIFIED 005c boundary with every field revalidated server-side;
 * phase 2 (normalize → private upload → one owner-scoped UPDATE) is
 * failure-contained and never blocks or undoes the save;
 * `wishlist_item_added` (entry_method "link") is emitted from this action
 * — never inside the 005c boundary modules.
 */

const mocks = vi.hoisted(() => ({
  saveReviewedItem: vi.fn(),
  finalizeItemSnapshot: vi.fn(),
  capture: vi.fn(),
  requireCompleteProfile: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("./item-write", () => ({
  saveReviewedItem: mocks.saveReviewedItem,
}));
vi.mock("./item-snapshot", () => ({
  finalizeItemSnapshot: mocks.finalizeItemSnapshot,
}));
vi.mock("@/src/analytics/server", () => ({
  getServerAnalytics: () => ({ capture: mocks.capture }),
}));
vi.mock("@/src/profile/session", () => ({
  requireCompleteProfile: mocks.requireCompleteProfile,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("server-only", () => ({}));

import { createReviewedItemAction } from "./review-actions";

const USER_ID = "00000000-0000-4000-8000-00000000000a";
const ITEM_ID = "00000000-0000-4000-8000-0000000000b0";
const SUBMISSION_ID = "00000000-0000-5000-8000-0000000000c0";

function formData(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    title: "Mushroom ceramic table lamp",
    sourceUrl: "https://shop.example/product/lamp",
    retailer: "Fixture Shop",
    amount: "24.99",
    currency: "INR",
    note: "The cream one.",
    desireLevel: "really_want",
    submissionId: SUBMISSION_ID,
    candidateImageUrl: "",
    reviewPhase: "extracted",
    ...overrides,
  })) {
    data.set(key, value);
  }
  return data;
}

async function outcomeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "returned";
  } catch (error) {
    return error instanceof Error && error.message.startsWith("NEXT_REDIRECT")
      ? error.message
      : `threw:${error}`;
  }
}

beforeEach(() => {
  mocks.requireCompleteProfile.mockReset().mockResolvedValue({
    userId: USER_ID,
    email: null,
    profile: { displayName: "Ada", tasteLine: null },
  });
  mocks.saveReviewedItem.mockReset();
  mocks.finalizeItemSnapshot.mockReset();
  mocks.capture.mockReset().mockResolvedValue({ ok: true, delivered: true });
});

describe("createReviewedItemAction", () => {
  it("creates through the 005c boundary with the exact minor-unit pair and no image columns", async () => {
    mocks.saveReviewedItem.mockResolvedValue({
      kind: "saved",
      itemId: ITEM_ID,
      replayed: false,
    });
    mocks.finalizeItemSnapshot.mockResolvedValue({
      imageUrl: null,
      snapshotPath: null,
      uploaded: false,
    });

    expect(
      await outcomeOf(createReviewedItemAction({ status: "idle" }, formData())),
    ).toBe("NEXT_REDIRECT:/wishlist?item=added");

    expect(mocks.saveReviewedItem).toHaveBeenCalledTimes(1);
    const [ownerId, operation, value] = mocks.saveReviewedItem.mock.calls[0];
    expect(ownerId).toBe(USER_ID);
    expect(operation).toEqual({
      kind: "create",
      submissionId: SUBMISSION_ID,
    });
    expect(value).toEqual({
      title: "Mushroom ceramic table lamp",
      source_url: "https://shop.example/product/lamp",
      retailer: "Fixture Shop",
      note: "The cream one.",
      desire_level: "really_want",
      original_amount_minor: "2499",
      original_currency: "INR",
    });
    // The create payload carries no image or extraction columns.
    expect(Object.keys(value)).not.toContain("image_url");
    expect(Object.keys(value)).not.toContain("image_snapshot_path");
    expect(Object.keys(value)).not.toContain("extraction_status");
  });

  it("runs the two-phase tail with the reviewed candidate and 'extracted' status", async () => {
    mocks.saveReviewedItem.mockResolvedValue({
      kind: "saved",
      itemId: ITEM_ID,
      replayed: false,
    });
    mocks.finalizeItemSnapshot.mockResolvedValue({
      imageUrl: "https://img.example/lamp-1.webp",
      snapshotPath: `${USER_ID}/${SUBMISSION_ID}.webp`,
      uploaded: true,
    });

    await outcomeOf(
      createReviewedItemAction(
        { status: "idle" },
        formData({ candidateImageUrl: "https://img.example/lamp-1.webp" }),
      ),
    );

    expect(mocks.finalizeItemSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.finalizeItemSnapshot).toHaveBeenCalledWith({
      ownerId: USER_ID,
      itemId: ITEM_ID,
      submissionId: SUBMISSION_ID,
      candidateImageUrl: "https://img.example/lamp-1.webp",
      extractionStatus: "extracted",
    });
  });

  it("persists 'manual' for a fallback save and passes no candidate", async () => {
    mocks.saveReviewedItem.mockResolvedValue({
      kind: "saved",
      itemId: ITEM_ID,
      replayed: false,
    });
    mocks.finalizeItemSnapshot.mockResolvedValue({
      imageUrl: null,
      snapshotPath: null,
      uploaded: false,
    });

    await outcomeOf(
      createReviewedItemAction(
        { status: "idle" },
        formData({ reviewPhase: "manual" }),
      ),
    );

    expect(mocks.finalizeItemSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateImageUrl: null,
        extractionStatus: "manual",
      }),
    );
  });

  it("clamps forged review phases to the persistable pair (never 'extracting'/'failed')", async () => {
    mocks.saveReviewedItem.mockResolvedValue({
      kind: "saved",
      itemId: ITEM_ID,
      replayed: false,
    });
    mocks.finalizeItemSnapshot.mockResolvedValue({
      imageUrl: null,
      snapshotPath: null,
      uploaded: false,
    });

    for (const forged of ["extracting", "failed", "root", ""]) {
      await outcomeOf(
        createReviewedItemAction(
          { status: "idle" },
          formData({ reviewPhase: forged }),
        ),
      );
      expect(mocks.finalizeItemSnapshot).toHaveBeenLastCalledWith(
        expect.objectContaining({ extractionStatus: "manual" }),
      );
    }
  });

  it("emits wishlist_item_added with entry_method link and honest has_price/has_image", async () => {
    mocks.saveReviewedItem.mockResolvedValue({
      kind: "saved",
      itemId: ITEM_ID,
      replayed: false,
    });
    mocks.finalizeItemSnapshot.mockResolvedValue({
      imageUrl: "https://img.example/lamp-1.webp",
      snapshotPath: `${USER_ID}/${SUBMISSION_ID}.webp`,
      uploaded: true,
    });

    await outcomeOf(createReviewedItemAction({ status: "idle" }, formData()));

    expect(mocks.capture).toHaveBeenCalledTimes(1);
    const [event, properties, context] = mocks.capture.mock.calls[0];
    expect(event).toBe("wishlist_item_added");
    expect(properties).toEqual({
      entry_method: "link",
      has_price: true,
      has_image: true,
    });
    expect(context).toEqual({ distinctId: USER_ID });
  });

  it("a replayed success emits nothing (the same item is counted once)", async () => {
    mocks.saveReviewedItem.mockResolvedValue({
      kind: "saved",
      itemId: ITEM_ID,
      replayed: true,
    });
    mocks.finalizeItemSnapshot.mockResolvedValue({
      imageUrl: null,
      snapshotPath: null,
      uploaded: false,
    });

    expect(
      await outcomeOf(createReviewedItemAction({ status: "idle" }, formData())),
    ).toBe("NEXT_REDIRECT:/wishlist?item=added");
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("reports has_image honestly when no candidate was chosen", async () => {
    mocks.saveReviewedItem.mockResolvedValue({
      kind: "saved",
      itemId: ITEM_ID,
      replayed: false,
    });
    mocks.finalizeItemSnapshot.mockResolvedValue({
      imageUrl: null,
      snapshotPath: null,
      uploaded: false,
    });

    await outcomeOf(createReviewedItemAction({ status: "idle" }, formData()));
    expect(mocks.capture.mock.calls[0][1]).toEqual({
      entry_method: "link",
      has_price: true,
      has_image: false,
    });
  });

  it("a normalization/upload/UPDATE failure never blocks or undoes the save", async () => {
    mocks.saveReviewedItem.mockResolvedValue({
      kind: "saved",
      itemId: ITEM_ID,
      replayed: false,
    });
    mocks.finalizeItemSnapshot.mockResolvedValue({
      imageUrl: null,
      snapshotPath: null,
      uploaded: false,
    });

    expect(
      await outcomeOf(
        createReviewedItemAction(
          { status: "idle" },
          formData({ candidateImageUrl: "https://img.example/lamp-1.webp" }),
        ),
      ),
    ).toBe("NEXT_REDIRECT:/wishlist?item=added");
  });

  it("returns 005c's submission-conflict state with the draft retained and emits nothing", async () => {
    const draft = formData();
    mocks.saveReviewedItem.mockResolvedValue({
      kind: "submission-conflict",
      savedItemId: ITEM_ID,
    });

    const state = await createReviewedItemAction({ status: "idle" }, draft);
    expect(state.status).toBe("submission-conflict");
    expect(state.savedItemId).toBe(ITEM_ID);
    expect(state.draft?.title).toBe("Mushroom ceramic table lamp");
    expect(mocks.finalizeItemSnapshot).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("maps retry and unavailable outcomes without touching phase 2", async () => {
    mocks.saveReviewedItem.mockResolvedValue({ kind: "retry" });
    expect(
      (await createReviewedItemAction({ status: "idle" }, formData())).status,
    ).toBe("retry");
    mocks.saveReviewedItem.mockResolvedValue({ kind: "unavailable" });
    expect(
      (await createReviewedItemAction({ status: "idle" }, formData())).status,
    ).toBe("unavailable");
    expect(mocks.finalizeItemSnapshot).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("revalidates every field server-side and returns field errors with the raw draft", async () => {
    const state = await createReviewedItemAction(
      { status: "idle" },
      formData({
        title: "",
        amount: "12.345",
        sourceUrl: "https://user:pass@shop.example/x",
      }),
    );
    expect(state.status).toBe("invalid");
    expect(state.errors).toMatchObject({
      title: "Enter a title.",
      amount: "Enter a valid amount for a supported currency.",
      sourceUrl: "Enter a public HTTP or HTTPS link.",
    });
    expect(state.draft?.title).toBe("");
    expect(state.draft?.amount).toBe("12.345");
    expect(mocks.saveReviewedItem).not.toHaveBeenCalled();
  });

  it("rejects a forged submission key before any persistence", async () => {
    const state = await createReviewedItemAction(
      { status: "idle" },
      formData({ submissionId: "not-a-uuid" }),
    );
    expect(state.status).toBe("invalid");
    expect(state.errors?.submissionId).toBe("Start a fresh item entry.");
    expect(mocks.saveReviewedItem).not.toHaveBeenCalled();
  });
});
