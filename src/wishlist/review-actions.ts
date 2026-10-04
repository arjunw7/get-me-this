"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getServerAnalytics } from "@/src/analytics/server";
import { requireCompleteProfile } from "@/src/profile/session";

import type { ItemActionState } from "./item-actions";
import {
  validateCreateDraft,
  type CreateDraft,
  type ItemFields,
} from "./item-input";
import { finalizeItemSnapshot } from "./item-snapshot";
import { saveReviewedItem } from "./item-write";

/**
 * The 005f save action for the extraction-review flow.
 *
 * This is 005f-owned wrapper code: it composes the UNMODIFIED 005c save
 * boundary (validation via `validateCreateDraft`, persistence via
 * `saveReviewedItem` with its replay and submission-conflict semantics)
 * with the two-phase image tail (normalize → private upload → one
 * idempotent owner-scoped UPDATE) and emits the `wishlist_item_added`
 * analytics event (entry_method "link") — never inside the 005c boundary
 * modules.
 *
 * Extraction output receives no implicit trust: every field is revalidated
 * by the identical 005c server rules before any persistence. The review
 * phase is clamped server-side to the only two persistable values
 * (`extracted` | `manual`); anything else — including the never-persisted
 * `extracting`/`failed` enum values — resolves to `manual`.
 */

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function createReviewedItemAction(
  _previous: ItemActionState,
  data: FormData,
): Promise<ItemActionState> {
  const { userId } = await requireCompleteProfile();
  const fields: ItemFields = {
    title: text(data.get("title")),
    sourceUrl: text(data.get("sourceUrl")),
    retailer: text(data.get("retailer")),
    amount: text(data.get("amount")),
    currency: text(data.get("currency")),
    note: text(data.get("note")),
    desireLevel: text(data.get("desireLevel")),
  };
  const draft: CreateDraft = {
    ...fields,
    submissionId: text(data.get("submissionId")),
  };
  if (!validUuid(draft.submissionId))
    return {
      status: "invalid",
      draft,
      errors: { submissionId: "Start a fresh item entry." },
    };
  const validation = validateCreateDraft(draft);
  if (!validation.ok)
    return { status: "invalid", draft, errors: validation.errors };

  const candidateText = text(data.get("candidateImageUrl")).trim();
  const candidateImageUrl = candidateText ? candidateText : null;
  const extractionStatus =
    text(data.get("reviewPhase")) === "extracted" ? "extracted" : "manual";

  // Phase 1: create through the unmodified 005c boundary. The create
  // payload carries no image or extraction columns; replay and
  // submission-conflict semantics are exactly 005c's.
  const outcome = await saveReviewedItem(
    userId,
    { kind: "create", submissionId: draft.submissionId },
    validation.value,
  );
  if (outcome.kind === "saved") {
    // Phase 2: normalization, private upload, and the one owner-scoped
    // UPDATE — every failure contained so the save is never blocked or
    // undone by a later step.
    const snapshot = await finalizeItemSnapshot({
      ownerId: userId,
      itemId: outcome.itemId,
      submissionId: draft.submissionId,
      candidateImageUrl,
      extractionStatus,
    });
    // An equal-payload replay is the SAME item being counted once: the
    // event fires on a genuinely new create only (flagged decision).
    if (!outcome.replayed) {
      await getServerAnalytics().capture(
        "wishlist_item_added",
        {
          entry_method: "link",
          has_price: validation.value.original_amount_minor !== null,
          has_image:
            snapshot.imageUrl !== null || snapshot.snapshotPath !== null,
        },
        { distinctId: userId },
      );
    }
    revalidatePath("/wishlist");
    redirect("/wishlist?item=added");
  }
  if (outcome.kind === "submission-conflict")
    return {
      status: "submission-conflict",
      savedItemId: outcome.savedItemId,
      draft,
      errors: {
        submissionId: "This item entry conflicted. Start over to try again.",
      },
    };
  return { status: outcome.kind === "retry" ? "retry" : "unavailable", draft };
}
