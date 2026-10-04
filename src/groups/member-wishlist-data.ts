import "server-only";

import { createSupabaseServerClient } from "@/src/supabase/server";

/**
 * Server-side member wishlist browsing data access (brief 006e). The page
 * consumes exactly ONE database projection —
 * public.member_wishlist_snapshot(uuid, uuid) — and never a base-table
 * query, a direct profile or item read, or any gifting/reservation/audit
 * surface. Both the viewer and the target are authorized inside the
 * database function from auth.uid(); nothing here trusts the browser.
 *
 * Every failure mode — provider unavailability, an unexpected shape, a
 * mixed sentinel, contradictory member labels — maps to the same null,
 * which the route renders as the generic not-found result. No failure
 * message ever carries group, member, or item content.
 */

export type MemberWishlistDesireLevel =
  "really_want" | "would_love" | "just_an_idea";

export type MemberWishlistItem = {
  readonly itemId: string;
  readonly title: string;
  readonly sourceUrl: string | null;
  readonly retailer: string | null;
  readonly imageUrl: string | null;
  readonly note: string | null;
  readonly desireLevel: MemberWishlistDesireLevel;
  readonly originalAmountMinor: string | null;
  readonly originalCurrency: string | null;
};

export type MemberWishlistSnapshot = {
  readonly memberDisplayName: string;
  readonly items: readonly MemberWishlistItem[];
};

export type MemberWishlistRow = {
  member_display_name: unknown;
  item_id: unknown;
  title: unknown;
  source_url: unknown;
  retailer: unknown;
  image_url: unknown;
  note: unknown;
  desire_level: unknown;
  original_amount_minor: unknown;
  original_currency: unknown;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

const DESIRE_LEVELS: readonly MemberWishlistDesireLevel[] = [
  "really_want",
  "would_love",
  "just_an_idea",
];

function isOptionalText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isSafeExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) && value.length <= 2048;
}

/**
 * Validates and combines the projection's rows into the browse model. Null
 * on every inconsistency — the route renders the same not-found result for
 * a denial and for a shape it cannot trust.
 *
 * Shape contract (brief 006e): zero rows means DENIED; exactly one row
 * with a null item_id is the authorized-EMPTY sentinel (member label
 * populated, item fields null); one or more rows with item ids is the
 * populated wishlist in the projection's committed order. Any mix — a
 * sentinel among items, contradictory member labels, an out-of-contract
 * field — is refused.
 */
export function parseMemberWishlistSnapshot(
  rows: readonly MemberWishlistRow[] | null,
): MemberWishlistSnapshot | null {
  if (!rows || rows.length === 0) return null;

  const first = rows[0];
  if (!first) return null;

  // The member display label is the header's identity and must be
  // identical on every row, including the empty sentinel.
  if (!isOptionalText(first.member_display_name)) return null;
  const memberDisplayName = first.member_display_name;
  if (memberDisplayName !== null && memberDisplayName.length === 0) return null;
  for (const row of rows) {
    if (row.member_display_name !== memberDisplayName) return null;
  }
  if (memberDisplayName === null) return null;

  // The authorized-empty sentinel: exactly one row, every item column null.
  if (first.item_id === null) {
    if (rows.length !== 1) return null;
    const sentinel = rows[0];
    if (
      sentinel.title !== null ||
      sentinel.source_url !== null ||
      sentinel.retailer !== null ||
      sentinel.image_url !== null ||
      sentinel.note !== null ||
      sentinel.desire_level !== null ||
      sentinel.original_amount_minor !== null ||
      sentinel.original_currency !== null
    ) {
      return null;
    }
    return { memberDisplayName, items: [] };
  }

  const items: MemberWishlistItem[] = [];
  const seenItemIds = new Set<string>();
  for (const row of rows) {
    if (
      !isUuid(row.item_id) ||
      typeof row.title !== "string" ||
      row.title.length === 0 ||
      !isOptionalText(row.source_url) ||
      !isOptionalText(row.retailer) ||
      !isOptionalText(row.image_url) ||
      !isOptionalText(row.note) ||
      typeof row.desire_level !== "string" ||
      !DESIRE_LEVELS.includes(row.desire_level as MemberWishlistDesireLevel)
    ) {
      return null;
    }
    // The image contract: only a usable remote https?:// URL is carried;
    // anything else (and never a storage path) renders the placeholder.
    const imageUrl = row.image_url;
    if (imageUrl !== null && !isSafeExternalUrl(imageUrl)) return null;

    // The source URL gets the same safe-external contract as the database
    // check constraint; a malformed value is a shape this application
    // refuses to render.
    const sourceUrl = row.source_url;
    if (sourceUrl !== null && !isSafeExternalUrl(sourceUrl)) return null;

    const money = parseMoneyPair(
      row.original_amount_minor,
      row.original_currency,
    );
    if (!money) return null;

    if (seenItemIds.has(row.item_id)) return null;
    seenItemIds.add(row.item_id);

    items.push({
      itemId: row.item_id,
      title: row.title,
      sourceUrl,
      retailer:
        row.retailer === null || row.retailer.length === 0
          ? null
          : row.retailer,
      imageUrl,
      note: row.note === null || row.note.length === 0 ? null : row.note,
      desireLevel: row.desire_level as MemberWishlistDesireLevel,
      originalAmountMinor: money.amountMinor,
      originalCurrency: money.currency,
    });
  }

  return { memberDisplayName, items };
}

/**
 * The 005a money pair: both present or both absent, the canonical
 * non-negative bigint minor amount and the uppercase ISO code. PostgREST
 * renders exact bigint as a JSON number; both transports carry the
 * canonical integer and are normalized to the exact string.
 */
function parseMoneyPair(
  amountMinor: unknown,
  currency: unknown,
): { amountMinor: string | null; currency: string | null } | null {
  if (amountMinor === null && currency === null) {
    return { amountMinor: null, currency: null };
  }
  const amountText =
    typeof amountMinor === "number" && Number.isInteger(amountMinor)
      ? amountMinor.toString()
      : amountMinor;
  if (
    typeof amountText === "string" &&
    /^\d+$/.test(amountText) &&
    typeof currency === "string" &&
    /^[A-Z]{3}$/.test(currency)
  ) {
    return { amountMinor: amountText, currency };
  }
  return null;
}

/**
 * Loads the member wishlist snapshot for the caller through the single
 * projection. Null for every denial, unknown group, and unavailable
 * provider.
 */
export async function loadMemberWishlistSnapshot(
  groupId: string,
  memberId: string,
): Promise<MemberWishlistSnapshot | null> {
  const client = await createSupabaseServerClient();
  if (!client) return null;

  const { data, error } = await client.rpc("member_wishlist_snapshot", {
    p_group_id: groupId,
    p_member_id: memberId,
  });
  if (error) return null;

  return parseMemberWishlistSnapshot(
    data as readonly MemberWishlistRow[] | null,
  );
}
