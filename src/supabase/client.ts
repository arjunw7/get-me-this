import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicConfig } from "./config";

/**
 * Typed browser Supabase client (004c): one half of the two clients built
 * from the single typed public configuration in src/supabase/config.ts.
 *
 * The client-lane session accessor for browser code — 004c's flow runs
 * through server actions and the proxy (server-side session maintenance),
 * and later approved slices (004e) read the session from the browser with
 * this client. Call it lazily inside client components; never at module
 * scope, so no client bundle runs unless a slice needs it.
 *
 * Returns null when the public configuration is absent so caller code can
 * degrade honestly rather than crash.
 */
export function createSupabaseBrowserClient() {
  const config = getSupabasePublicConfig();
  if (!config) return null;
  return createBrowserClient(config.url, config.publishableKey);
}
