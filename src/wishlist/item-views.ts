import "server-only";

import { createSupabaseServerClient } from "@/src/supabase/server";

import { getOwnWishlist } from "./data";
import { toItemView, type OwnWishlistView } from "./display";
import type { WishlistItemSnapshot, WishlistItemView } from "./display";
import { SNAPSHOT_BUCKET } from "./item-snapshot";

/**
 * Snapshot-first display resolution (005f, server-only).
 *
 * For every item whose row references a private snapshot object, a
 * short-expiry signed URL is created server-side; the view that crosses
 * into any client component carries ONLY the signed URL (or the
 * `image_url` fallback), never the raw storage path, and signed URLs
 * never enter logs, analytics, or evidence. A signed-URL failure degrades
 * to the designed fallback order (snapshot → image_url → branded
 * placeholder) — it is a display concern, never an error surface.
 */

const SIGNED_URL_EXPIRY_SECONDS = 60;

async function signedUrlMap(
  paths: readonly string[],
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  if (paths.length === 0) return resolved;
  const client = await createSupabaseServerClient();
  if (!client) return resolved;
  const { data } = await client.storage
    .from(SNAPSHOT_BUCKET)
    .createSignedUrls([...paths], SIGNED_URL_EXPIRY_SECONDS);
  for (const entry of data ?? []) {
    const candidate = entry as { path?: unknown; signedUrl?: unknown };
    if (
      typeof candidate.path === "string" &&
      typeof candidate.signedUrl === "string" &&
      candidate.signedUrl
    ) {
      resolved.set(candidate.path, candidate.signedUrl);
    }
  }
  return resolved;
}

/** Resolves every item's image source and strips raw snapshot paths. */
export async function toItemViews(
  items: readonly WishlistItemSnapshot[],
): Promise<WishlistItemView[]> {
  const paths = items
    .map((item) => item.imageSnapshotPath)
    .filter((path): path is string => path !== null);
  const urls = await signedUrlMap(paths);
  return items.map((item) =>
    toItemView(
      item,
      item.imageSnapshotPath === null
        ? null
        : (urls.get(item.imageSnapshotPath) ?? null),
    ),
  );
}

/**
 * The owner's wishlist as client-safe views, or null per `getOwnWishlist`'s
 * missing-row invariant contract.
 */
export async function resolveOwnWishlistView(
  userId: string,
): Promise<OwnWishlistView | null> {
  const wishlist = await getOwnWishlist(userId);
  if (!wishlist) return null;
  return {
    wishlistId: wishlist.wishlistId,
    items: await toItemViews(wishlist.items),
  };
}
