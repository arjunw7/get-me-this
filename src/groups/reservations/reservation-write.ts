import "server-only";

import { createSupabaseServerClient } from "@/src/supabase/server";
import { isReservationReleaseResult, isReservationWriteResult } from "./types";
import type { ReservationReleaseResult, ReservationWriteResult } from "./types";

/**
 * Server-side reservation data access (brief 007c). Every call goes through
 * the 007c public database API — never a base-table query. The actor is
 * derived from the authenticated session inside the database functions via
 * auth.uid(); a signed-out or otherwise denied caller gets the same generic
 * failure as every other denial class, and the UI restores the prior state.
 *
 * Denial classes (`conflict`, `already_yours`, `unavailable`) are
 * indistinguishable to any caller who is not themselves eligible; the UI
 * maps them to the friendly conflict / state-restore behaviors below.
 */

export type ReservationOutcome =
  | { kind: "confirmed"; result: ReservationWriteResult }
  | { kind: "unavailable" }
  | { kind: "retry" };

type ReserveFunctionRow = {
  result: unknown;
  reservation_id: unknown;
};

/**
 * Atomically claim the item for the caller. The authoritative result is the
 * function's own `result` text; the caller's UI applies only that verdict.
 */
export async function reserveGroupItem(
  groupId: string,
  itemId: string,
): Promise<ReservationOutcome> {
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "unavailable" };

  const { data, error } = await client.rpc("reserve_group_item", {
    p_group_id: groupId,
    p_item_id: itemId,
  });
  if (error) return { kind: "retry" };

  const rows = (data ?? []) as ReserveFunctionRow[];
  const first = rows[0];
  if (!first || !isReservationWriteResult(first.result)) {
    return { kind: "unavailable" };
  }
  return { kind: "confirmed", result: first.result };
}

export type ReleaseOutcome =
  | { kind: "confirmed"; result: ReservationReleaseResult }
  | { kind: "unavailable" }
  | { kind: "retry" };

/**
 * Release the caller's own active reservation. Reserver-only authority is
 * checked inside the database function; any other caller gets the generic
 * `unavailable` outcome.
 */
export async function releaseGroupReservation(
  groupId: string,
  reservationId: string,
): Promise<ReleaseOutcome> {
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "unavailable" };

  const { data, error } = await client.rpc("release_group_reservation", {
    p_group_id: groupId,
    p_reservation_id: reservationId,
  });
  if (error) return { kind: "retry" };

  const rows = (data ?? []) as { result: unknown }[];
  const first = rows[0];
  if (!first || !isReservationReleaseResult(first.result)) {
    return { kind: "unavailable" };
  }
  return { kind: "confirmed", result: first.result };
}

/**
 * The caller's own active reservations in one group (brief 007c
 * `my_group_reservations`). Zero rows for every denial class.
 */
export type OwnReservation = {
  reservationId: string;
  itemId: string | null;
  itemTitleSnapshot: string;
};

export async function getMyGroupReservations(
  groupId: string,
): Promise<OwnReservation[]> {
  const client = await createSupabaseServerClient();
  if (!client) return [];

  const { data, error } = await client.rpc("my_group_reservations", {
    p_group_id: groupId,
  });
  if (error) return [];

  const rows = (data ?? []) as {
    reservation_id: unknown;
    item_id: unknown;
    item_title_snapshot: unknown;
  }[];
  const mapped: OwnReservation[] = [];
  for (const row of rows) {
    if (
      typeof row.reservation_id === "string" &&
      typeof row.item_title_snapshot === "string"
    ) {
      mapped.push({
        reservationId: row.reservation_id,
        itemId: typeof row.item_id === "string" ? row.item_id : null,
        itemTitleSnapshot: row.item_title_snapshot,
      });
    }
  }
  return mapped;
}
