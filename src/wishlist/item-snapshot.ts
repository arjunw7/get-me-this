import "server-only";

import { createSupabaseServerClient } from "@/src/supabase/server";

import { normalizeCandidateImage } from "./extraction/image-normalizer";

/**
 * The 005f two-phase save tail (server-only).
 *
 * The 005c create boundary and the `append_wishlist_item` RPC are consumed
 * unmodified: the create lands first with the schema defaults, and only
 * then does this module normalize the chosen candidate through 005e's
 * server-only function, upload the bounded WebP to the private
 * `wishlist-item-snapshots` bucket under the owner's own prefix, and
 * perform exactly ONE idempotent owner-scoped UPDATE of `image_url`,
 * `image_snapshot_path`, and `extraction_status` under the existing 005a
 * UPDATE grant. Every later-step failure is contained: the item already
 * exists as a valid saved item, so a normalization, upload, or UPDATE
 * failure never blocks, undoes, or fails the save — the honest visible
 * state and the designed image fallback apply instead.
 *
 * No service role anywhere: the upload uses the caller's authenticated
 * server client under the owner-only storage policies of migration
 * 20261002000000_wishlist_item_snapshot_bucket.sql. Raw paths and signed
 * URLs are never logged.
 */

export const SNAPSHOT_BUCKET = "wishlist-item-snapshots" as const;

/**
 * The pinned object path shape: `{owner_id}/{client_submission_id}.webp`.
 * The storage policies scope every operation to the first path folder
 * equal to the caller's auth.uid()::text, so the path is derived ONLY from
 * server-derived identity — never from posted values.
 */
export function snapshotObjectPath(
  ownerId: string,
  submissionId: string,
): string {
  return `${ownerId}/${submissionId}.webp`;
}

export type SnapshotOutcome = {
  /** The selected remote candidate, persisted when one was chosen. */
  readonly imageUrl: string | null;
  /** The private object path, persisted only when the upload succeeded. */
  readonly snapshotPath: string | null;
  readonly uploaded: boolean;
};

const UPDATE_ATTEMPTS = 3;
const UPLOAD_ATTEMPTS = 2;
const RETRY_DELAY_MS = 250;

/** The image_url column limit: the candidate is clamped to it server-side. */
const MAX_CANDIDATE_URL_LENGTH = 2_048;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export async function finalizeItemSnapshot(options: {
  readonly ownerId: string;
  readonly itemId: string;
  readonly submissionId: string;
  readonly candidateImageUrl: string | null;
  readonly extractionStatus: "extracted" | "manual";
}): Promise<SnapshotOutcome> {
  const { ownerId, itemId, submissionId, candidateImageUrl, extractionStatus } =
    options;

  // The posted candidate is untrusted input: clamp it to the image_url
  // column limit (2048 characters) before any use, so a forged over-long
  // value can neither burn the UPDATE retry loop with a guaranteed-failing
  // write nor reach the normalizer. An over-long candidate is discarded and
  // resolves to the designed placeholder fallback (both image columns null).
  const candidate =
    candidateImageUrl !== null &&
    [...candidateImageUrl].length <= MAX_CANDIDATE_URL_LENGTH
      ? candidateImageUrl
      : null;

  // Phase 2a: normalize the chosen candidate through the 005e boundary.
  // A failed or skipped normalization leaves the snapshot null and never
  // blocks the save; the remote image_url (when a candidate was chosen)
  // remains the designed fallback.
  let snapshotPath: string | null = null;
  if (candidate) {
    let bytes: Uint8Array | null = null;
    try {
      bytes = await normalizeCandidateImage(candidate);
    } catch {
      // Contained: the 005e function already resolves its own failures to
      // null, and a defensive catch keeps any unexpected throw from ever
      // failing the save.
      bytes = null;
    }
    if (bytes && bytes.length > 0) {
      // Phase 2b: upload to the private bucket after create. The path is
      // deterministic, so an equal-payload replay overwrites the same
      // object with equivalent bounded content (upsert, never a duplicate).
      const path = snapshotObjectPath(ownerId, submissionId);
      if (await uploadSnapshot(bytes, path)) snapshotPath = path;
    }
  }

  // Phase 2c: the one owner-scoped UPDATE, retried in-flow before success
  // is surfaced. Re-running it with the same values is a no-op.
  const imageUrl = candidate;
  let persisted = false;
  for (let attempt = 0; attempt < UPDATE_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS * attempt);
    if (
      await updateItemImageColumns({
        ownerId,
        itemId,
        imageUrl,
        snapshotPath,
        extractionStatus,
      })
    ) {
      persisted = true;
      break;
    }
  }
  if (!persisted) {
    // Honest degraded outcome per the brief: the UPDATE could not complete
    // after the in-flow retries, so the row keeps its create-time defaults
    // (both image columns null, extraction_status 'manual') and the save
    // is still reported as a save — never as a failure that would invite a
    // duplicate.
    return { imageUrl: null, snapshotPath: null, uploaded: false };
  }
  return { imageUrl, snapshotPath, uploaded: snapshotPath !== null };
}

async function uploadSnapshot(
  bytes: Uint8Array,
  path: string,
): Promise<boolean> {
  const client = await createSupabaseServerClient();
  if (!client) return false;
  for (let attempt = 0; attempt < UPLOAD_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);
    const { error } = await client.storage
      .from(SNAPSHOT_BUCKET)
      .upload(path, bytes, {
        contentType: "image/webp",
        upsert: true,
      });
    if (!error) return true;
  }
  return false;
}

async function updateItemImageColumns(options: {
  readonly ownerId: string;
  readonly itemId: string;
  readonly imageUrl: string | null;
  readonly snapshotPath: string | null;
  readonly extractionStatus: "extracted" | "manual";
}): Promise<boolean> {
  const client = await createSupabaseServerClient();
  if (!client) return false;
  const { data, error } = await client
    .from("wishlist_items")
    .update({
      image_url: options.imageUrl,
      image_snapshot_path: options.snapshotPath,
      extraction_status: options.extractionStatus,
    })
    .eq("owner_id", options.ownerId)
    .eq("id", options.itemId)
    .select("id");
  if (error) return false;
  return (data as { id: string }[] | null)?.length === 1;
}
