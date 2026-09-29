import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cookieStore: { name: string; value: string }[] = [];

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => cookieStore,
    set: (name: string, value: string) => {
      const existing = cookieStore.find((c) => c.name === name);
      if (existing) existing.value = value;
      else cookieStore.push({ name, value });
    },
  }),
}));

const { createSupabaseServerClient } = await import("./server");

/**
 * The typed server client (004c): built from the public configuration only,
 * wired to Next.js cookie storage, and null when the configuration is
 * absent. The client construction itself is exercised lightly here — the
 * provider interactions are proven through the actions tests and the
 * Mailpit e2e.
 */
const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_URL;
  if (ORIGINAL_KEY === undefined)
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ORIGINAL_KEY;
  cookieStore.length = 0;
});

describe("createSupabaseServerClient", () => {
  it("returns null without the public configuration", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(await createSupabaseServerClient()).toBeNull();
  });

  it("returns a client wired to the request's cookies", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    cookieStore.push({ name: "sb-mock-session", value: "value" });

    const client = await createSupabaseServerClient();
    expect(client).not.toBeNull();
    expect(client?.auth).toBeDefined();
  });
});
