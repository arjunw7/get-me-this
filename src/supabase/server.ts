import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getSupabasePublicConfig } from "./config";

/**
 * Typed server Supabase client (004c): the other half of the two clients
 * built from the single typed public configuration in
 * src/supabase/config.ts, wired to Next.js cookie storage via the standard
 * `@supabase/ssr` scheme. Sessions live in cookies (004c keeps Supabase's
 * standard cookie scheme as-is: the browser client of later slices needs
 * cookie access to maintain the session, so session cookies are not
 * HttpOnly — only the app-owned carry cookie is).
 *
 * A new client must be created per server render or action; never shared
 * across requests. The `setAll` cookie write is allowed in Server Actions
 * (where 004c's verify action establishes the session) and Route Handlers;
 * a write attempted during a plain render is skipped — proxy.ts owns
 * session refresh there, so the request keeps its existing cookies.
 *
 * Returns null when the public configuration is absent.
 */
export async function createSupabaseServerClient() {
  const config = getSupabasePublicConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Render contexts cannot set cookies; proxy.ts refreshes the
          // session before such renders, so this is safe to ignore.
        }
      },
    },
  });
}
