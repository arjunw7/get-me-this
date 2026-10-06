import "server-only";
import { createSupabaseServerClient } from "@/src/supabase/server";

/** Only the viewer's own current copies, under owner RLS, after browse authorization. */
export async function loadOwnCopiedItemIds(
  sourceItemIds: readonly string[],
): Promise<ReadonlySet<string>> {
  if (!sourceItemIds.length) return new Set();
  const client = await createSupabaseServerClient();
  if (!client) return new Set();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return new Set();
  const { data, error } = await client
    .from("wishlist_items")
    .select("copied_from_item_id")
    .eq("owner_id", user.id)
    .in("copied_from_item_id", [...sourceItemIds]);
  if (error || !Array.isArray(data)) return new Set();
  const allowed = new Set(sourceItemIds);
  return new Set(
    data.flatMap((row) =>
      typeof row.copied_from_item_id === "string" &&
      allowed.has(row.copied_from_item_id)
        ? [row.copied_from_item_id]
        : [],
    ),
  );
}
