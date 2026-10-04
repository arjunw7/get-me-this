import "server-only";
import { createSupabaseServerClient } from "@/src/supabase/server";
import { parseVibe } from "@/src/profile/vibe";
import {
  isReactionKind,
  type ReactionSummaryRow,
} from "@/src/groups/reactions/types";
import type { OwnerReactionSummary } from "@/src/groups/reactions/reaction-write";
import { parsePublicShareToken } from "./public-share-token";
import type { OwnShareState, PublicWishlistView } from "./public-share-types";

export const PUBLIC_ITEM_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
export function parsePublicReaction(value: unknown): ReactionSummaryRow | null {
  if (
    !record(value) ||
    typeof value.item_id !== "string" ||
    !PUBLIC_ITEM_ID.test(value.item_id) ||
    !count(value.very_you_count) ||
    !count(value.questionable_count) ||
    !count(value.want_it_too_count) ||
    (value.viewer_reaction !== null && !isReactionKind(value.viewer_reaction))
  )
    return null;
  return {
    itemId: value.item_id,
    counts: {
      veryYou: value.very_you_count,
      questionable: value.questionable_count,
      wantItToo: value.want_it_too_count,
    },
    viewerReaction: value.viewer_reaction,
  };
}
export function parseOwnShareState(value: unknown): OwnShareState | null {
  if (!Array.isArray(value) || value.length !== 1 || !record(value[0]))
    return null;
  const row = value[0];
  const version = count(row.version) ? String(row.version) : row.version;
  if (
    typeof version !== "string" ||
    !/^(0|[1-9][0-9]{0,18})$/.test(version) ||
    BigInt(version) > BigInt("9223372036854775807") ||
    typeof row.enabled !== "boolean"
  )
    return null;
  const shareToken = parsePublicShareToken(row.share_token);
  if (row.enabled ? !shareToken : row.share_token !== null) return null;
  return { enabled: row.enabled, version, shareToken };
}
function optionalText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
function safeUrl(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function parsePublicWishlist(
  value: unknown,
  token: string,
): PublicWishlistView | null {
  if (
    !parsePublicShareToken(token) ||
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every(record)
  )
    return null;
  const first = value[0];
  const vibe = parseVibe(first.vibe);
  if (
    typeof first.display_name !== "string" ||
    !first.display_name.trim() ||
    !optionalText(first.taste_line) ||
    !vibe ||
    typeof first.viewer_is_owner !== "boolean"
  )
    return null;
  if (
    !value.every(
      (row) =>
        row.display_name === first.display_name &&
        row.taste_line === first.taste_line &&
        row.vibe === first.vibe &&
        row.viewer_is_owner === first.viewer_is_owner,
    )
  )
    return null;
  const header = {
    displayName: first.display_name,
    tasteLine: first.taste_line,
    vibe,
    viewerIsOwner: first.viewer_is_owner,
  };
  const itemFields = [
    "item_id",
    "title",
    "source_url",
    "retailer",
    "note",
    "desire_level",
    "original_amount_minor",
    "original_currency",
    "has_image",
    "very_you_count",
    "questionable_count",
    "want_it_too_count",
    "viewer_reaction",
  ];
  if (first.item_id === null)
    return value.length === 1 && itemFields.every((key) => first[key] === null)
      ? { ...header, items: [] }
      : null;
  const items: PublicWishlistView["items"][number][] = [];
  const ids = new Set<string>();
  for (const row of value) {
    const reaction = parsePublicReaction(row);
    if (
      !reaction ||
      ids.has(reaction.itemId) ||
      typeof row.title !== "string" ||
      !row.title.trim() ||
      !safeUrl(row.source_url) ||
      !optionalText(row.retailer) ||
      !optionalText(row.note) ||
      typeof row.has_image !== "boolean" ||
      !["really_want", "would_love", "just_an_idea"].includes(
        String(row.desire_level),
      )
    )
      return null;
    const amount = row.original_amount_minor;
    const currency = row.original_currency;
    if (
      !(amount === null && currency === null) &&
      !(
        typeof amount === "string" &&
        /^(0|[1-9][0-9]{0,18})$/.test(amount) &&
        BigInt(amount) <= BigInt("9223372036854775807") &&
        typeof currency === "string" &&
        /^[A-Z]{3}$/.test(currency)
      )
    )
      return null;
    ids.add(reaction.itemId);
    items.push({
      itemId: reaction.itemId,
      title: row.title,
      sourceUrl: row.source_url,
      retailer: row.retailer,
      note: row.note,
      desireLevel: row.desire_level as
        "really_want" | "would_love" | "just_an_idea",
      originalAmountMinor: amount as string | null,
      originalCurrency: currency as string | null,
      imageUrl: row.has_image ? `/s/${token}/images/${reaction.itemId}` : null,
      reaction,
    });
  }
  return { ...header, items };
}
export async function loadOwnShareState(): Promise<OwnShareState | null> {
  try {
    const client = await createSupabaseServerClient();
    if (!client) return null;
    const { data, error } = await client.rpc("own_wishlist_share_state");
    return error ? null : parseOwnShareState(data);
  } catch {
    return null;
  }
}
export async function loadPublicWishlist(
  token: string,
): Promise<PublicWishlistView | null> {
  if (!parsePublicShareToken(token)) return null;
  try {
    const client = await createSupabaseServerClient();
    if (!client) return null;
    const { data, error } = await client.rpc("public_wishlist_snapshot", {
      p_token: token,
    });
    return error ? null : parsePublicWishlist(data, token);
  } catch {
    return null;
  }
}
export async function loadOwnPublicReactions(): Promise<
  OwnerReactionSummary[]
> {
  try {
    const client = await createSupabaseServerClient();
    if (!client) return [];
    const { data, error } = await client.rpc(
      "own_public_wishlist_reaction_summary",
    );
    if (error || !Array.isArray(data)) return [];
    return data.flatMap((row) => {
      const parsed = parsePublicReaction({ ...row, viewer_reaction: null });
      return parsed ? [{ itemId: parsed.itemId, counts: parsed.counts }] : [];
    });
  } catch {
    return [];
  }
}
export function combineOwnerReactions(
  ...sources: OwnerReactionSummary[][]
): OwnerReactionSummary[] {
  const result = new Map<string, OwnerReactionSummary>();
  for (const row of sources.flat()) {
    const previous = result.get(row.itemId)?.counts ?? {
      veryYou: 0,
      questionable: 0,
      wantItToo: 0,
    };
    result.set(row.itemId, {
      itemId: row.itemId,
      counts: {
        veryYou: previous.veryYou + row.counts.veryYou,
        questionable: previous.questionable + row.counts.questionable,
        wantItToo: previous.wantItToo + row.counts.wantItToo,
      },
    });
  }
  return [...result.values()];
}
