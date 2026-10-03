import "server-only";
import { createSupabaseServerClient } from "@/src/supabase/server";
import { parseVibe, type Vibe } from "@/src/profile/vibe";

export type MemberVibes = Readonly<Record<string, Vibe>>;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The new projection carries only joined member identity and their selected colour. */
export function parseMemberVibes(rows: unknown): MemberVibes {
  if (!Array.isArray(rows)) return {};
  const result: Record<string, Vibe> = {};
  for (const row of rows) {
    if (
      !row ||
      typeof row !== "object" ||
      typeof row.member_user_id !== "string" ||
      !UUID.test(row.member_user_id) ||
      Object.hasOwn(result, row.member_user_id)
    )
      return {};
    const vibe = parseVibe(row.vibe);
    if (!vibe) return {};
    result[row.member_user_id] = vibe;
  }
  return result;
}

/** Caller/membership checks live in the auth.uid()-scoped database projection. */
export async function loadGroupMemberVibes(
  groupId: string,
): Promise<MemberVibes> {
  if (!UUID.test(groupId)) return {};
  const client = await createSupabaseServerClient();
  if (!client) return {};
  const { data, error } = await client.rpc("group_member_vibes", {
    p_group_id: groupId,
  });
  return error ? {} : parseMemberVibes(data);
}
