import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Deterministic fixture management for the E2E_LOCAL_SUPABASE-gated
 * wishlist specs (005b), against the LOCAL Supabase stack the CI database
 * job starts (scripts/e2e-local-stack.sh exports the stack's silent-parsed
 * configuration) — never against production or staging mock data.
 *
 * Users are created through the admin API (which fires the real profile
 * and wishlist signup triggers) and signed in through the REAL surface:
 * the admin-minted magic link opened in the browser, the explicit "Use my
 * sign-in link" click, and onboarding. Item fixtures are inserted through
 * the service-role client (bypassing RLS only for setup, the same way the
 * user-testing validator seeds), then deleted.
 *
 * Hygiene: every fixture user is deleted in teardown (cascades to their
 * profile, wishlist, and items). No credential material is logged.
 */

export function requireStackEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set — run the stack-gated suites through scripts/e2e-local-stack.sh (or export the stack's configuration).`,
    );
  }
  return value;
}

export function isLocalStackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

/** A service-role client for fixture setup/teardown only — never app code. */
export function stackAdminClient(): SupabaseClient {
  const url = requireStackEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!isLocalStackUrl(url)) {
    throw new Error(
      "fixture admin client requires a local HTTP Supabase target",
    );
  }
  return createClient(url, requireStackEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Cleanup registration is immediate and runs in reverse creation order. */
export class FixtureScope {
  private pending: Array<() => Promise<void>> = [];

  register(_label: string, cleanup: () => Promise<void>): void {
    this.pending.push(cleanup);
  }

  async cleanup(): Promise<void> {
    const pending = this.pending.splice(0).reverse();
    const results = await Promise.allSettled(
      pending.map((step) => Promise.resolve().then(step)),
    );
    if (results.some((result) => result.status === "rejected")) {
      throw new Error(
        "fixture cleanup failed; all registered cleanup steps were attempted",
      );
    }
  }

  async run<T>(body: () => Promise<T>): Promise<T> {
    let failed = false;
    let firstFailure: unknown;
    let value: T | undefined;
    try {
      value = await body();
    } catch (error) {
      failed = true;
      firstFailure = error;
    }
    try {
      await this.cleanup();
    } catch (cleanupError) {
      if (failed) {
        throw new AggregateError(
          [firstFailure, cleanupError],
          "fixture work and cleanup failed",
        );
      }
      throw cleanupError;
    }
    if (failed) throw firstFailure;
    return value as T;
  }
}

type FixtureOperations = {
  createUser: typeof createFixtureUser;
  signIn: typeof signInFixtureUser;
  deleteUser: typeof deleteFixtureUser;
};

/** Returns only after sign-in; a failed sign-in deletes its just-created user. */
export async function createSignedInFixture(
  page: Page,
  admin: SupabaseClient,
  prefix: string,
  profile: { displayName: string; tasteLine?: string },
  scope: FixtureScope,
  operations: FixtureOperations = {
    createUser: createFixtureUser,
    signIn: signInFixtureUser,
    deleteUser: deleteFixtureUser,
  },
): Promise<string> {
  const email = fixtureEmail(prefix);
  const userId = await operations.createUser(admin, email);
  scope.register("fixture user", () => operations.deleteUser(admin, userId));
  try {
    await operations.signIn(page, admin, email, profile);
    return userId;
  } catch (error) {
    try {
      await scope.cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "fixture sign-in and cleanup failed",
      );
    }
    throw error;
  }
}

/** A fresh synthetic address per run; local-stack data only. The
 *  .invalid domain keeps synthetic users undeliverable by construction
 *  (the brief's privacy section: fixtures are @example.invalid). */
export function fixtureEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.invalid`;
}

/** Creates the fixture user; fires the real signup triggers. */
export async function createFixtureUser(
  admin: SupabaseClient,
  email: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(
      `fixture user creation failed: ${error?.message ?? "no user"}`,
    );
  }
  return data.user.id;
}

export async function deleteFixtureUser(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(`fixture user cleanup failed: ${error.message}`);
  }
}

/**
 * Signs the fixture user in through the real surface: opens the
 * admin-minted link's confirm URL in the browser, clicks the explicit
 * "Use my sign-in link" action, completes onboarding, and lands on /home.
 * Screenshots are never taken before redirects complete, so the token
 * hash never appears in captured evidence.
 */
export async function signInFixtureUser(
  page: Page,
  admin: SupabaseClient,
  email: string,
  profile: { displayName: string; tasteLine?: string },
): Promise<void> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data.properties?.hashed_token) {
    throw new Error(`magic-link mint failed: ${error?.message ?? "no hash"}`);
  }

  await page.goto(
    `/auth/confirm?token_hash=${data.properties.hashed_token}&type=email`,
  );
  await expect(page).toHaveURL(/\/auth\/link$/);
  await page.getByRole("button", { name: "Use my sign-in link" }).click();

  // A profile-less user lands on onboarding; a user who already has a
  // complete profile (e.g. re-signing in after a stale session) goes
  // straight to their destination, which defaults to /home.
  await page.waitForURL((url) => /\/(onboarding|home)$/.test(url.pathname));
  if (page.url().endsWith("/onboarding")) {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Tell friends who you are.",
    );
    await page
      .getByLabel("What should friends call you?")
      .fill(profile.displayName);
    if (profile.tasteLine !== undefined) {
      await page
        .getByLabel(/Describe your taste in one line/i)
        .fill(profile.tasteLine);
    }
    await page.getByRole("button", { name: /Let’s go/i }).click();
    await page.waitForURL("**/home");
  }
}

export type ItemFixture = {
  id: string;
  title: string;
  source_url?: string | null;
  retailer?: string | null;
  image_url?: string | null;
  image_snapshot_path?: string | null;
  note?: string | null;
  desire_level?: "really_want" | "would_love" | "just_an_idea";
  sort_position: number;
  original_amount_minor?: string | null;
  original_currency?: string | null;
  /** 005g: the optional stored converted-money tuple, seeded as fixture
   * data only — no production writer exists in the dormant slice. */
  converted_amount_minor?: string | null;
  converted_currency?: string | null;
  conversion_rate_source?: string | null;
  conversion_rate_at?: string | null;
};

/** Resolves the fixture owner's trigger-generated wishlist id. */
export async function fixtureWishlistId(
  admin: SupabaseClient,
  ownerId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("wishlists")
    .select("id")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error || !data) {
    throw new Error(`wishlist lookup failed: ${error?.message ?? "no row"}`);
  }
  return (data as { id: string }).id;
}

/** Seeds deterministic item fixtures into the owner's wishlist. */
export async function seedWishlistItems(
  admin: SupabaseClient,
  ownerId: string,
  items: readonly ItemFixture[],
): Promise<void> {
  const wishlistId = await fixtureWishlistId(admin, ownerId);
  const { error } = await admin.from("wishlist_items").insert(
    items.map((item) => ({
      wishlist_id: wishlistId,
      owner_id: ownerId,
      desire_level: "would_love" as const,
      extraction_status: "manual" as const,
      ...item,
    })),
  );
  if (error) {
    throw new Error(`item seeding failed: ${error.message}`);
  }
}
