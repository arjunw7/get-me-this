// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

const { createSupabaseBrowserClient } = await import("./client");

/**
 * The typed browser client (004c): built from the public configuration
 * only, null when the configuration is absent. Client components call it
 * lazily; 004c's flow runs through server actions, so this client has no
 * caller yet — its shape and configuration boundary are pinned here for
 * the slices that consume it.
 */
const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_URL;
  if (ORIGINAL_KEY === undefined)
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ORIGINAL_KEY;
});

describe("createSupabaseBrowserClient", () => {
  it("returns null without the public configuration", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(createSupabaseBrowserClient()).toBeNull();
  });

  it("returns a browser client from the two public values", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

    const client = createSupabaseBrowserClient();
    expect(client).not.toBeNull();
    expect(client?.auth).toBeDefined();
  });
});
