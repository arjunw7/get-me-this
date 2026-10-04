import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to);
  },
}));

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
let providerConfigured = true;

vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: async () =>
    providerConfigured ? { auth: { getUser } } : null,
}));

import AuthPage from "@/app/auth/page";
import { EmailEntryForm } from "./email-entry-form";

beforeEach(() => {
  providerConfigured = true;
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: null }, error: null });
});

describe("auth entry session routing", () => {
  it.each([{}, { intent: "wishlist" }, { next: "https://example.com" }])(
    "redirects a verified signed-in user to home with query %j",
    async (params) => {
      getUser.mockResolvedValue({
        data: { user: { id: "user-1", email: "you@example.com" } },
        error: null,
      });

      await expect(
        AuthPage({ searchParams: Promise.resolve(params) }),
      ).rejects.toThrow(new RedirectSignal("/home"));
    },
  );

  it("keeps the sign-in form and intended helper for signed-out users", async () => {
    const page = await AuthPage({
      searchParams: Promise.resolve({ intent: "wishlist" }),
    });

    expect(page.type).toBe(EmailEntryForm);
    expect(page.props.intent).toBe("wishlist");
    expect(page.props.intentNote).toBe(
      "First, a quick sign-in. Then you’ll add your first item.",
    );
  });

  it("keeps sign-in available when the provider rejects an invalid session", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Session is invalid", status: 401 },
    });

    const page = await AuthPage({ searchParams: Promise.resolve({}) });
    expect(page.type).toBe(EmailEntryForm);
  });

  it("keeps sign-in available without provider configuration", async () => {
    providerConfigured = false;

    const page = await AuthPage({ searchParams: Promise.resolve({}) });
    expect(page.type).toBe(EmailEntryForm);
  });
});
