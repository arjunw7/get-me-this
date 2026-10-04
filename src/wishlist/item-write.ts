import "server-only";

import { createSupabaseServerClient } from "@/src/supabase/server";

import { wishlistTestBarrier } from "./test-barrier";
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

  await wishlistTestBarrier("after-live-key-before-insert");
  const item = value as ValidItem;
  const { data, error } = await client.rpc("append_wishlist_item", {
    submission_id: operation.submissionId,
    item_title: item.title,
    source_url: item.source_url,
    retailer: item.retailer,
    note: item.note,
    desire_level: item.desire_level,
    original_amount_minor: item.original_amount_minor,
    original_currency: item.original_currency,
  });
  if (error) return { kind: "retry" };
  const rows = data as Array<{
    result: unknown;
    item_id: unknown;
    replayed: unknown;
  }> | null;
  if (!rows || rows.length !== 1) return { kind: "retry" };
  const row = rows[0];
  if (
    (row.result === "saved" || row.result === "replayed") &&
    typeof row.item_id === "string" &&
    typeof row.replayed === "boolean"
  )
    return { kind: "saved", itemId: row.item_id, replayed: row.replayed };
  if (row.result === "submission-conflict" && typeof row.item_id === "string")
    return { kind: "submission-conflict", savedItemId: row.item_id };
  return row.result === "unavailable"
    ? { kind: "unavailable" }
    : { kind: "retry" };
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
  await wishlistTestBarrier("after-edit-read-before-update");
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

function isDefiniteDatabaseRejection(error: unknown, status: number): boolean {
  const candidate = error as { code?: unknown } | null;
  return (
    status >= 400 &&
    status < 500 &&
    typeof candidate?.code === "string" &&
    /^[0-9A-Z]{5}$/.test(candidate.code)
  );
}

export async function deleteOwnItem(
  ownerId: string,
  itemId: string,
): Promise<DeleteOutcome> {
  const client = await clientOrNull();
  if (!client) return { kind: "uncertain" };
  const { data, error, status } = await client
    .from("wishlist_items")
    .delete()
    .eq("owner_id", ownerId)
    .eq("id", itemId)
    .select("id");
  if (error)
    return isDefiniteDatabaseRejection(error, status)
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
