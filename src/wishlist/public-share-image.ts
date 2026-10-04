import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { normalizeCandidateImage } from "./extraction/image-normalizer";
import { parsePublicShareToken } from "./public-share-token";
import { PUBLIC_ITEM_ID } from "./public-share-data";

const MAX_BYTES = 5 * 1024 * 1024;
async function fetchPublicWishlistImage(
  token: string,
  itemId: string,
): Promise<Uint8Array | null> {
  if (!parsePublicShareToken(token) || !PUBLIC_ITEM_ID.test(itemId))
    return null;
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim();
  if (!url || !key) return null;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const source = async () => {
    const { data, error } = await client.rpc("public_wishlist_image_source", {
      p_token: token,
      p_item_id: itemId,
    });
    return !error && Array.isArray(data) && data.length === 1
      ? (data[0] as Record<string, unknown>)
      : null;
  };
  try {
    const row = await source();
    if (!row) return null;
    let bytes: Uint8Array | null = null;
    if (
      typeof row.image_snapshot_path === "string" &&
      typeof row.owner_id === "string" &&
      PUBLIC_ITEM_ID.test(row.owner_id)
    ) {
      const parts = row.image_snapshot_path.split("/");
      if (
        parts.length !== 2 ||
        parts[0] !== row.owner_id ||
        !parts[1].endsWith(".webp") ||
        !PUBLIC_ITEM_ID.test(parts[1].slice(0, -5))
      )
        return null;
      const { data, error } = await client.storage
        .from("wishlist-item-snapshots")
        .download(row.image_snapshot_path);
      if (!error && data && data.size <= MAX_BYTES)
        bytes = new Uint8Array(await data.arrayBuffer());
    }
    if (!bytes && typeof row.image_url === "string")
      bytes = await normalizeCandidateImage(row.image_url);
    if (!bytes || bytes.length > MAX_BYTES) return null;
    // Slow image fetches must not finish serving a link revoked meanwhile.
    const current = await source();
    if (
      !current ||
      current.image_snapshot_path !== row.image_snapshot_path ||
      current.image_url !== row.image_url
    )
      return null;
    return bytes;
  } catch {
    return null;
  }
}

// A public visitor must not be able to fork unbounded image-normalization workers.
// The digest is process-local only; raw sharing capabilities are never logged.
const pendingImages = new Map<string, Promise<Uint8Array | null>>();
const MAX_PENDING_IMAGES = 32;
const MAX_ACTIVE_IMAGES = 4;
let activeImages = 0;
const imageQueue: (() => void)[] = [];
async function boundedImageFetch(token: string, itemId: string) {
  if (activeImages >= MAX_ACTIVE_IMAGES) {
    await new Promise<void>((resolve) => imageQueue.push(resolve));
  } else activeImages++;
  try {
    return await fetchPublicWishlistImage(token, itemId);
  } finally {
    const next = imageQueue.shift();
    if (next) next();
    else activeImages--;
  }
}
export async function loadPublicWishlistImage(
  token: string,
  itemId: string,
): Promise<Uint8Array | null> {
  if (!parsePublicShareToken(token) || !PUBLIC_ITEM_ID.test(itemId))
    return null;
  const key = createHash("sha256")
    .update(token)
    .update(":")
    .update(itemId)
    .digest("hex");
  const pending = pendingImages.get(key);
  if (pending) return pending;
  if (pendingImages.size >= MAX_PENDING_IMAGES) return null;
  const task = boundedImageFetch(token, itemId);
  pendingImages.set(key, task);
  try {
    return await task;
  } finally {
    pendingImages.delete(key);
  }
}
