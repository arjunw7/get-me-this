/**
 * Browser-exposed Supabase configuration for the email-code flow (004c).
 *
 * Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
 * are read here — the publishable key is safe for public clients. The
 * service-role key never appears in any module reachable by client code.
 *
 * Returns null when either value is unset so the documentation-stage builds
 * (CI, visual capture) stay buildable without credentials and the auth
 * actions can degrade into the honest generic recovery states.
 */

export type SupabasePublicConfig = {
  readonly url: string;
  readonly publishableKey: string;
};

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  if (!/^https?:\/\//.test(url)) return null;
  return { url, publishableKey };
}
