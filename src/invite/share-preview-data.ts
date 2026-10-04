import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/src/supabase/config";
import { occasionDateText } from "@/src/groups/room-format";

export type InvitationSharePreview = {
  groupName: string;
  organizerName: string;
  date: string;
};

export function isInvitationPreviewDigest(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

/** A preview digest can read three fields, but cannot join or recover a bearer.
 * No session cookies, service credential, refresh or persistent client state. */
export async function loadInvitationSharePreview(
  digest: string,
): Promise<InvitationSharePreview | null> {
  if (!isInvitationPreviewDigest(digest)) return null;
  const config = getSupabasePublicConfig();
  if (!config) return null;
  try {
    const client = createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    });
    const { data, error } = await client.rpc("group_invitation_share_preview", {
      p_digest: digest,
    });
    if (error || !Array.isArray(data) || data.length !== 1) return null;
    const row = data[0];
    if (
      !row ||
      typeof row.group_name !== "string" ||
      !row.group_name.trim() ||
      row.group_name.length > 120 ||
      typeof row.host_display_name !== "string" ||
      !row.host_display_name.trim() ||
      row.host_display_name.length > 120 ||
      typeof row.occasion_at !== "string"
    )
      return null;
    const date = occasionDateText(row.occasion_at);
    return date
      ? {
          groupName: row.group_name,
          organizerName: row.host_display_name,
          date,
        }
      : null;
  } catch {
    return null;
  }
}
