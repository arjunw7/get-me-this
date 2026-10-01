"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCompleteProfile } from "@/src/profile/session";

import {
  validateCreateDraft,
  validateEditDraft,
  type CreateDraft,
  type EditDraft,
  type ItemFields,
} from "./item-input";
import {
  deleteOwnItem,
  loadOwnItemForEdit,
  reconcileOwnItem,
  saveReviewedItem,
} from "./item-write";

export type ItemActionState = {
  status: "idle" | "invalid" | "unavailable" | "retry" | "submission-conflict";
  savedItemId?: string;
  draft?: CreateDraft | EditDraft;
  errors?: Partial<
    Record<keyof ItemFields | "submissionId" | "priceIntent", string>
  >;
};
export type DeleteActionState = {
  status:
    "idle" | "deleted" | "unavailable" | "definite-rejection" | "uncertain";
};
export type ReconcileActionState = {
  status: "idle" | "present" | "absent" | "uncertain";
};

const emptyFields = (data: FormData): ItemFields => ({
  title: text(data.get("title")),
  sourceUrl: text(data.get("sourceUrl")),
  retailer: text(data.get("retailer")),
  amount: text(data.get("amount")),
  currency: text(data.get("currency")),
  note: text(data.get("note")),
  desireLevel: text(data.get("desireLevel")),
});
function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
function unavailableDraft(
  fields: ItemFields,
  extra: Record<string, string>,
): ItemActionState {
  return {
    status: "unavailable",
    draft: { ...fields, ...extra } as CreateDraft | EditDraft,
  };
}

export async function createItemAction(
  _previous: ItemActionState,
  data: FormData,
): Promise<ItemActionState> {
  const { userId } = await requireCompleteProfile();
  const fields = emptyFields(data);
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
  const outcome = await saveReviewedItem(
    userId,
    { kind: "create", submissionId: draft.submissionId },
    validation.value,
  );
  if (outcome.kind === "saved") {
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

export async function editItemAction(
  itemId: string,
  _previous: ItemActionState,
  data: FormData,
): Promise<ItemActionState> {
  const { userId } = await requireCompleteProfile();
  const fields = emptyFields(data);
  const draft: EditDraft = {
    ...fields,
    priceIntent: text(data.get("priceIntent")),
  };
  if (!validUuid(itemId))
    return unavailableDraft(fields, { priceIntent: draft.priceIntent });
  let current;
  try {
    current = await loadOwnItemForEdit(userId, itemId);
  } catch {
    return { status: "retry", draft };
  }
  if (!current) return { status: "unavailable", draft };
  const validation = validateEditDraft(draft, current);
  if (!validation.ok)
    return { status: "invalid", draft, errors: validation.errors };
  const outcome = await saveReviewedItem(
    userId,
    { kind: "edit", itemId },
    validation.value,
  );
  if (outcome.kind === "saved") {
    revalidatePath("/wishlist");
    redirect("/wishlist?item=updated");
  }
  return { status: outcome.kind === "retry" ? "retry" : "unavailable", draft };
}

export async function deleteItemAction(
  itemId: string,
  previous: DeleteActionState,
  data: FormData,
): Promise<DeleteActionState> {
  const { userId } = await requireCompleteProfile();
  void previous;
  void data;
  if (!validUuid(itemId)) return { status: "unavailable" };
  const outcome = await deleteOwnItem(userId, itemId);
  if (outcome.kind === "deleted") {
    revalidatePath("/wishlist");
    // The edit route re-reads the owner row after a Server Action. Since a
    // committed delete makes that row unavailable, redirect in the action so
    // the edit page cannot unmount the dialog before it observes success.
    redirect("/wishlist?item=deleted");
    return { status: "deleted" };
  }
  return { status: outcome.kind };
}

export async function reconcileDeleteAction(
  itemId: string,
  previous: ReconcileActionState,
  data: FormData,
): Promise<ReconcileActionState> {
  const { userId } = await requireCompleteProfile();
  void previous;
  void data;
  if (!validUuid(itemId)) return { status: "uncertain" };
  const outcome = await reconcileOwnItem(userId, itemId);
  return { status: outcome.kind };
}
