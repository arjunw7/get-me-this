import "server-only";

import { createSupabaseServerClient } from "@/src/supabase/server";

import type { OriginalPair, ValidItem, ValidatedEdit } from "./item-input";

const EDIT_ITEM_COLUMNS = [
  "id",
  "wishlist_id",
  "owner_id",
  "title",
  "source_url",
  "retailer",
  "note",
  "desire_level",
  "original_amount_minor::text",
  "original_currency",
  "converted_amount_minor::text",
  "converted_currency",
  "conversion_rate_source",
  "conversion_rate_at",
  "updated_at",
].join(",");
const REPLAY_COLUMNS =
  "id,title,source_url,retailer,note,desire_level,original_amount_minor::text,original_currency";
const MAX_SORT_POSITION = 2147483647;

export type EditItem = {
  id: string;
  wishlist_id: string;
  owner_id: string;
  title: string;
  source_url: string | null;
  retailer: string | null;
  note: string | null;
  desire_level: ValidItem["desire_level"];
  original_amount_minor: string | null;
  original_currency: string | null;
  converted_amount_minor: string | null;
  converted_currency: string | null;
  conversion_rate_source: string | null;
  conversion_rate_at: string | null;
  updated_at: string;
};

export type SaveOutcome =
  | { kind: "saved"; itemId: string; replayed: boolean }
  | { kind: "unavailable" }
  | { kind: "retry" }
  | { kind: "submission-conflict"; savedItemId: string };
export type DeleteOutcome =
  | { kind: "deleted" }
  | { kind: "unavailable" }
  | { kind: "definite-rejection" }
  | { kind: "uncertain" };
export type ReconcileOutcome =
  { kind: "present" } | { kind: "absent" } | { kind: "uncertain" };

export function classifyReplay(
  current: ValidItem,
  submitted: ValidItem,
): "match" | "conflict" {
  return current.title === submitted.title &&
    current.source_url === submitted.source_url &&
    current.retailer === submitted.retailer &&
    current.note === submitted.note &&
    current.desire_level === submitted.desire_level &&
    current.original_amount_minor === submitted.original_amount_minor &&
    current.original_currency === submitted.original_currency
    ? "match"
    : "conflict";
}

async function clientOrNull() {
  return createSupabaseServerClient();
}

async function ownerWishlist(
  client: NonNullable<Awaited<ReturnType<typeof clientOrNull>>>,
  ownerId: string,
) {
  const { data, error } = await client
    .from("wishlists")
    .select("id")
    .eq("owner_id", ownerId)
    .maybeSingle();
  return error ? null : (data as { id: string } | null);
}

async function findSubmission(
  client: NonNullable<Awaited<ReturnType<typeof clientOrNull>>>,
  ownerId: string,
  submissionId: string,
) {
  const { data, error } = await client
    .from("wishlist_items")
    .select(REPLAY_COLUMNS)
    .eq("owner_id", ownerId)
    .eq("client_submission_id", submissionId)
    .maybeSingle();
  if (error) throw new Error("wishlist submission could not be loaded");
  return data as (ValidItem & { id: string }) | null;
}

function replayOutcome(
  row: ValidItem & { id: string },
  submitted: ValidItem,
): SaveOutcome {
  return classifyReplay(row, submitted) === "match"
    ? { kind: "saved", itemId: row.id, replayed: true }
    : { kind: "submission-conflict", savedItemId: row.id };
}

export async function saveReviewedItem(
  ownerId: string,
  operation: { kind: "create"; submissionId: string },
  value: ValidItem,
): Promise<SaveOutcome>;
export async function saveReviewedItem(
  ownerId: string,
  operation: { kind: "edit"; itemId: string },
  value: ValidatedEdit,
): Promise<SaveOutcome>;
export async function saveReviewedItem(
  ownerId: string,
  operation:
    { kind: "create"; submissionId: string } | { kind: "edit"; itemId: string },
  value: ValidItem | ValidatedEdit,
): Promise<SaveOutcome> {
  const client = await clientOrNull();
  if (!client) return { kind: "unavailable" };
  if (operation.kind === "edit")
    return saveEdit(client, ownerId, operation.itemId, value as ValidatedEdit);

  let existing: (ValidItem & { id: string }) | null;
  try {
    existing = await findSubmission(client, ownerId, operation.submissionId);
  } catch {
    return { kind: "unavailable" };
  }
  if (existing) return replayOutcome(existing, value as ValidItem);
  const parent = await ownerWishlist(client, ownerId);
  if (!parent) return { kind: "unavailable" };

  const { data: maxRow, error: maxError } = await client
    .from("wishlist_items")
    .select("sort_position")
    .eq("owner_id", ownerId)
    .eq("wishlist_id", parent.id)
    .order("sort_position", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) return { kind: "unavailable" };
  const currentMax = maxRow
    ? (maxRow as { sort_position: number }).sort_position
    : -1;
  if (
    !Number.isInteger(currentMax) ||
    currentMax < -1 ||
    currentMax >= MAX_SORT_POSITION
  )
    return { kind: "unavailable" };

  const insertPayload = {
    wishlist_id: parent.id,
    owner_id: ownerId,
    title: (value as ValidItem).title,
    source_url: (value as ValidItem).source_url,
    retailer: (value as ValidItem).retailer,
    note: (value as ValidItem).note,
    desire_level: (value as ValidItem).desire_level,
    original_amount_minor: (value as ValidItem).original_amount_minor,
    original_currency: (value as ValidItem).original_currency,
    image_url: null,
    image_snapshot_path: null,
    extraction_status: "manual",
    sort_position: currentMax + 1,
    client_submission_id: operation.submissionId,
  };
  const { data: inserted, error } = await client
    .from("wishlist_items")
    .insert(insertPayload)
    .select("id")
    .single();
  if (!error && inserted)
    return {
      kind: "saved",
      itemId: (inserted as { id: string }).id,
      replayed: false,
    };
  if ((error as { code?: string } | null)?.code !== "23505")
    return { kind: "unavailable" };
  let afterConflict: (ValidItem & { id: string }) | null;
  try {
    afterConflict = await findSubmission(
      client,
      ownerId,
      operation.submissionId,
    );
  } catch {
    return { kind: "unavailable" };
  }
  return afterConflict
    ? replayOutcome(afterConflict, value as ValidItem)
    : { kind: "unavailable" };
}

async function saveEdit(
  client: NonNullable<Awaited<ReturnType<typeof clientOrNull>>>,
  ownerId: string,
  itemId: string,
  value: ValidatedEdit,
): Promise<SaveOutcome> {
  let current: EditItem | null;
  try {
    current = await loadOwnItemForEditWith(client, ownerId, itemId);
  } catch {
    return { kind: "unavailable" };
  }
  if (!current) return { kind: "unavailable" };
  if (
    value.price.kind === "preserve" &&
    !samePair(current, value.price.expected)
  )
    return { kind: "retry" };

  const target: OriginalPair =
    value.price.kind === "preserve"
      ? {
          original_amount_minor: current.original_amount_minor,
          original_currency: current.original_currency,
        }
      : value.price.kind === "clear"
        ? { original_amount_minor: null, original_currency: null }
        : {
            original_amount_minor: value.price.original_amount_minor,
            original_currency: value.price.original_currency,
          };
  const pairChanged = !samePair(current, target);
  const payload: Record<string, unknown> = { ...value.item };
  if (pairChanged) {
    payload.original_amount_minor = target.original_amount_minor;
    payload.original_currency = target.original_currency;
    payload.converted_amount_minor = null;
    payload.converted_currency = null;
    payload.conversion_rate_source = null;
    payload.conversion_rate_at = null;
  }
  let query = client
    .from("wishlist_items")
    .update(payload)
    .eq("owner_id", ownerId)
    .eq("id", itemId);
  query =
    current.original_amount_minor === null
      ? query.is("original_amount_minor", null)
      : query.eq("original_amount_minor", current.original_amount_minor);
  query =
    current.original_currency === null
      ? query.is("original_currency", null)
      : query.eq("original_currency", current.original_currency);
  const { data, error } = await query.select("id");
  if (error) return { kind: "unavailable" };
  if ((data as { id: string }[] | null)?.length === 1)
    return { kind: "saved", itemId, replayed: false };
  const after = await loadOwnItemForEditWith(client, ownerId, itemId);
  return after ? { kind: "retry" } : { kind: "unavailable" };
}

function samePair(a: OriginalPair, b: OriginalPair): boolean {
  return (
    a.original_amount_minor === b.original_amount_minor &&
    a.original_currency === b.original_currency
  );
}

async function loadOwnItemForEditWith(
  client: NonNullable<Awaited<ReturnType<typeof clientOrNull>>>,
  ownerId: string,
  itemId: string,
): Promise<EditItem | null> {
  const { data, error } = await client
    .from("wishlist_items")
    .select(EDIT_ITEM_COLUMNS)
    .eq("owner_id", ownerId)
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw new Error("wishlist item could not be loaded");
  return data as EditItem | null;
}

export async function loadOwnItemForEdit(
  ownerId: string,
  itemId: string,
): Promise<EditItem | null> {
  const client = await clientOrNull();
  return client ? loadOwnItemForEditWith(client, ownerId, itemId) : null;
}

function isDefiniteDatabaseRejection(error: unknown): boolean {
  const candidate = error as { code?: unknown; status?: unknown } | null;
  return (
    typeof candidate?.code === "string" &&
    /^[0-9A-Z]{5}$/.test(candidate.code) &&
    typeof candidate.status === "number" &&
    candidate.status >= 400
  );
}

export async function deleteOwnItem(
  ownerId: string,
  itemId: string,
): Promise<DeleteOutcome> {
  const client = await clientOrNull();
  if (!client) return { kind: "uncertain" };
  const { data, error } = await client
    .from("wishlist_items")
    .delete()
    .eq("owner_id", ownerId)
    .eq("id", itemId)
    .select("id");
  if (error)
    return isDefiniteDatabaseRejection(error)
      ? { kind: "definite-rejection" }
      : { kind: "uncertain" };
  const rows = data as { id: string }[] | null;
  if (rows?.length === 1 && rows[0]?.id === itemId) return { kind: "deleted" };
  return rows?.length === 0 ? { kind: "unavailable" } : { kind: "uncertain" };
}

export async function reconcileOwnItem(
  ownerId: string,
  itemId: string,
): Promise<ReconcileOutcome> {
  const client = await clientOrNull();
  if (!client) return { kind: "uncertain" };
  const { data, error } = await client
    .from("wishlist_items")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("id", itemId)
    .maybeSingle();
  if (error) return { kind: "uncertain" };
  return data ? { kind: "present" } : { kind: "absent" };
}
