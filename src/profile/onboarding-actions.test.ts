import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const analytics = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@/src/analytics/server", () => ({
  getServerAnalytics: () => analytics,
}));

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

let mockClient: {
  auth: { getUser: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
} | null;

vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: async () => mockClient,
}));

import { completeOnboardingAction } from "./onboarding-actions";

/**
 * The onboarding completion action (004e): server-side re-validation over
 * the shared rule (blank name rejected, blank taste line normalized to
 * null, over-limit rejected — never truncated), the write to the owner's
 * own profile row, and the fixed `/home` redirect.
 */

const IDLE = { status: "idle" } as const;

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  analytics.capture.mockReset();
  mockClient = {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  };
});

afterEach(() => {
  mockClient = null;
  vi.restoreAllMocks();
});

/** Builds the mock query chain for the profile update. */
function mockUpdate(result: { error: unknown }) {
  mockClient!.from.mockImplementation(() => ({
    update: () => ({
      eq: () => Promise.resolve(result),
    }),
  }));
}

describe("completeOnboardingAction", () => {
  it("persists the display name and a null-normalized taste line to the own profile, then navigates to /home", async () => {
    mockClient!.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "you@example.com" } },
    });
    mockUpdate({ error: null });

    await expect(
      completeOnboardingAction(IDLE, formData({ displayName: "  Ada  " })),
    ).rejects.toThrow(new RedirectSignal("/home"));

    expect(mockClient!.from).toHaveBeenCalledWith("profiles");
    expect(analytics.capture).toHaveBeenCalledExactlyOnceWith(
      "onboarding_completed",
      { avatar_selected: false },
      { distinctId: "user-1" },
    );
  });

  it.each(["tomato", "marigold", "electric", "acid_lime"])(
    "persists chosen Vibe %s for the authenticated account",
    async (vibe) => {
      mockClient!.auth.getUser.mockResolvedValue({
        data: { user: { id: "owner" } },
      });
      const eq = vi.fn().mockResolvedValue({ error: null });
      const update = vi.fn().mockReturnValue({ eq });
      mockClient!.from.mockReturnValue({ update });
      await expect(
        completeOnboardingAction(
          IDLE,
          formData({ displayName: "Ada", vibe, userId: "someone-else" }),
        ),
      ).rejects.toThrow(new RedirectSignal("/home"));
      expect(update).toHaveBeenCalledWith({
        display_name: "Ada",
        taste_line: null,
        vibe,
      });
      expect(eq).toHaveBeenCalledWith("id", "owner");
    },
  );
  it("omits Vibe on an older submission, preserving the saved value or database default", async () => {
    mockClient!.auth.getUser.mockResolvedValue({
      data: { user: { id: "owner" } },
    });
    const update = vi
      .fn()
      .mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockClient!.from.mockReturnValue({ update });
    await expect(
      completeOnboardingAction(IDLE, formData({ displayName: "Ada" })),
    ).rejects.toThrow(new RedirectSignal("/home"));
    expect(update).toHaveBeenCalledWith({
      display_name: "Ada",
      taste_line: null,
    });
  });
  it.each(["", "coral", "Electric", "electric ", "pink"])(
    "refuses invalid Vibe %s before writing",
    async (vibe) => {
      mockClient!.auth.getUser.mockResolvedValue({
        data: { user: { id: "owner" } },
      });
      expect(
        await completeOnboardingAction(
          IDLE,
          formData({ displayName: "Ada", vibe }),
        ),
      ).toEqual({ status: "error", errors: { vibe: "invalid" } });
      expect(mockClient!.from).not.toHaveBeenCalled();
    },
  );
  it("returns a new profile to the public wishlist after saving, without a reaction", async () => {
    const share = "A".repeat(43);
    mockClient!.auth.getUser.mockResolvedValue({
      data: { user: { id: "owner" } },
    });
    const update = vi
      .fn()
      .mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockClient!.from.mockReturnValue({ update });
    await expect(
      completeOnboardingAction(
        IDLE,
        formData({ displayName: "Ada", share, reaction: "very_you" }),
      ),
    ).rejects.toThrow(new RedirectSignal(`/s/${share}`));
    expect(update).toHaveBeenCalledWith({
      display_name: "Ada",
      taste_line: null,
    });
    expect(mockClient!.from).toHaveBeenCalledExactlyOnceWith("profiles");
  });
  it.each(["//evil.example", "A".repeat(42) + "B"])(
    "ignores an unsafe public return identifier after onboarding",
    async (share) => {
      mockClient!.auth.getUser.mockResolvedValue({
        data: { user: { id: "owner" } },
      });
      mockUpdate({ error: null });
      await expect(
        completeOnboardingAction(IDLE, formData({ displayName: "Ada", share })),
      ).rejects.toThrow(new RedirectSignal("/home"));
    },
  );
  it("rejects a blank display name server-side without any write", async () => {
    mockClient!.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    for (const blank of ["", " ", "\t\n", "\u00A0\u3000", "\uFEFF"]) {
      const result = await completeOnboardingAction(
        IDLE,
        formData({ displayName: blank }),
      );
      expect(result, JSON.stringify(blank)).toEqual({
        status: "error",
        errors: { displayName: "required" },
      });
    }
    expect(mockClient!.from).not.toHaveBeenCalled();
  });

  it("rejects an over-limit taste line instead of truncating", async () => {
    mockClient!.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const result = await completeOnboardingAction(
      IDLE,
      formData({ displayName: "Ada", tasteLine: "x".repeat(61) }),
    );
    expect(result).toEqual({
      status: "error",
      errors: { tasteLine: "too-long" },
    });
    expect(mockClient!.from).not.toHaveBeenCalled();
  });

  it("requires a session: a signed-out submit is sent to /auth", async () => {
    mockClient!.auth.getUser.mockResolvedValue({ data: { user: null } });

    await expect(
      completeOnboardingAction(IDLE, formData({ displayName: "Ada" })),
    ).rejects.toThrow(new RedirectSignal("/auth"));
    expect(mockClient!.from).not.toHaveBeenCalled();
  });

  it("reports a database rejection honestly without provider detail", async () => {
    mockClient!.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mockUpdate({ error: { code: "23514", message: "check constraint" } });

    const result = await completeOnboardingAction(
      IDLE,
      formData({ displayName: "Ada" }),
    );
    expect(result).toEqual({ status: "error", failure: "update-failed" });
  });

  it("fails safely when the provider configuration is absent", async () => {
    mockClient = null;
    const result = await completeOnboardingAction(
      IDLE,
      formData({ displayName: "Ada" }),
    );
    expect(result).toEqual({ status: "error", failure: "unavailable" });
  });
});
